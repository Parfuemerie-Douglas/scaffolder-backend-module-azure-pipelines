/*
 * Copyright 2022 Parfümerie Douglas GmbH
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {  DefaultAzureDevOpsCredentialsProvider, ScmIntegrationRegistry } from "@backstage/integration";
import { createTemplateAction } from "@backstage/plugin-scaffolder-node";

interface RunPipelineRequest {
  previewRun?: boolean;
  resources?: {
    repositories: {
      self: {
        refName: string;
        repositoryId?: string;
        repositoryType?: string;
      };
    };
  };
  templateParameters?: {
    [key: string]: string;
  };
  variables?: string;
  yamlOverrides?: string;
}

interface ApiVersions {
  runApiVersion: string,
  buildApiVersion: string
}

export const runAzurePipelineAction = (options: {
  integrations: ScmIntegrationRegistry;
}) => {
  const { integrations } = options;

  async function checkPipelineStatus(host: string, organization: string, project: string, runId: number, token: string | null | undefined, buildApiVersion: string): Promise<boolean> {
    const response = await fetch(
      `https://${host}/${organization}/${project}/_apis/build/builds/${runId}?api-version=${buildApiVersion}`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`PAT:${token}`).toString("base64")}`,
          "X-TFS-FedAuthRedirect": "Suppress",
        },
      }
    );
    if (!response.ok) {
      throw new Error(`Failed to retrieve pipeline run status. Status code ${response.status}.`);
    }
    const json: any = await response.json();
    const status = json.status;
    if (status === "completed") {
      return json.result === "succeeded";
    } else if (status === "inProgress" || status === "notStarted") {
      // If the pipeline is still running, wait 10 seconds and check again.
      await new Promise((resolve) => setTimeout(resolve, 10000));
      return checkPipelineStatus(host, organization, project, runId, token,buildApiVersion);
    }
    throw new Error(`Azure pipeline failed with status: ${status}.`);
  }

  return createTemplateAction<{
    runApiVersion: string,
    buildApiVersion: string
    server: string;
    organization: string;
    pipelineId: string;
    project: string;
    branch?: string;
    token?: string;
    pipelineParameters?: object;
    pipelineVariables?: object;
  }>({
    id: "azure:pipeline:run",
    schema: {
      input: {
        required: [
          "organization",
          "pipelineId",
          "project"
        ],
        type: "object",
        properties: {
          runApiVersion: {
            type: "string",
            title: "Run API version",
            description: "The Azure Run Pipeline API version to use. Defaults to 7.0",
          },
          buildApiVersion: {
            type: "string",
            title: "Build API version",
            description: "The Builds API version to use. Defaults to 6.1-preview.6",
          },
          server: {
            type: "string",
            title: "Host",
            description: "The host of Azure DevOps. Defaults to dev.azure.com",
          },
          organization: {
            type: "string",
            title: "Organization",
            description: "The name of the Azure DevOps organization.",
          },
          pipelineId: {
            type: "string",
            title: "Pipeline ID",
            description: "The pipeline ID.",
          },
          project: {
            type: "string",
            title: "Project",
            description: "The name of the Azure project.",
          },
          branch: {
            title: "Repository Branch",
            type: "string",
            description: "The branch of the pipeline's repository.",
          },
          pipelineParameters: {
            title: "Pipeline Parameters",
            type: "object",
            description: "The values you need as parameters on the request to start a build.",
          },
        },
      },
    },
    async handler(ctx) {
      const {
        runApiVersion,
        buildApiVersion,
        server,
        organization,
        pipelineId,
        project,
        branch,
        pipelineParameters,
      } = ctx.input;

      const host = server ?? "dev.azure.com";
      const apiVersions: ApiVersions = {
        runApiVersion: runApiVersion ?? "7.0",
        buildApiVersion: buildApiVersion ?? "6.1-preview.6"
      }
      const provider = DefaultAzureDevOpsCredentialsProvider.fromIntegrations(integrations);
      const url = `https://${host}/${ctx.input.organization}`;
      const credentials = await provider.getCredentials({ url: url });
      const token = ctx.input.token ?? credentials?.token;

      ctx.logger.info(`Running Azure pipeline with the ID ${pipelineId}.`);
      
      const request: RunPipelineRequest = {
        resources: {
          repositories: {
            self: {
              refName: `refs/heads/${branch ?? "main"}`,
            },
          },
        },
        templateParameters: pipelineParameters as Record<string, string>,
        yamlOverrides: "",
      };

      const body = JSON.stringify(request);


      const fetchModule = await import("node-fetch");
      const fetch: typeof fetchModule.default = fetchModule.default;
      // See the Azure DevOps documentation for more information about the REST API:
      // https://docs.microsoft.com/en-us/rest/api/azure/devops/pipelines/runs/run-pipeline?view=azure-devops-rest-7.0
      await fetch(
        `https://${host}/${organization}/${project}/_apis/pipelines/${pipelineId}/runs?api-version=${apiVersions.runApiVersion}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Basic ${Buffer.from(`PAT:${token}`).toString(
              "base64"
            )}`,
            "X-TFS-FedAuthRedirect": "Suppress",
          },
          body,
        }
      ).then((response: any) => {
        if (response.ok) {
          return response.json();
        }
        throw new Error(`Failed to run Azure pipeline. Status code ${response.status}.`);
      }).then((json: any) => {
        const pipelineUrl = json._links.web.href;
        ctx.logger.info(`Successfully started Azure pipeline run: ${pipelineUrl}`);

        const pipelineRunId = json.id;

        // Poll the pipeline status until it completes.
        return checkPipelineStatus(host, organization, project, pipelineRunId, token, apiVersions.buildApiVersion);
      })
        .then((success: any) => {
          if (success) {
            ctx.logger.info(`Azure pipeline completed successfully.`);
          } else {
            ctx.logger.error(`Azure pipeline failed.`);
          }
        })
        .catch((error: any) => {
          // Handle any errors that occurred during the pipeline run or status check.
          ctx.logger.error(error.message);
        });
    },
  });
};
