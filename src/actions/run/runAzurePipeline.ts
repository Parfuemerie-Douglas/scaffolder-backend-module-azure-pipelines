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

import { InputError } from "@backstage/errors";
import { ScmIntegrationRegistry } from "@backstage/integration";
import { createTemplateAction } from "@backstage/plugin-scaffolder-node";

import fetch from "node-fetch";

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

export const runAzurePipelineAction = (options: {
  integrations: ScmIntegrationRegistry;
}) => {
  const { integrations } = options;

  async function checkPipelineStatus(host: string, organization: string, project: string, runId: number, token: string): Promise<boolean> {
    const response = await fetch(
      `https://${host}/${organization}/${project}/_apis/build/builds/${runId}?api-version=6.1-preview.6`,
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
    const json = await response.json();
    const status = json.status;
    if (status === "completed") {
      return json.result === "succeeded";
    } else if (status === "inProgress" || status === "notStarted") {
      // If the pipeline is still running, wait 10 seconds and check again.
      await new Promise((resolve) => setTimeout(resolve, 10000));
      return checkPipelineStatus(host, organization, project, runId, token);
    } else {
      throw new Error(`Azure pipeline failed with status: ${status}.`);
    }
  }

  return createTemplateAction<{
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
          server: {
            type: "string",
            title: "Server hostname",
            description: "The hostname of the Azure DevOps service. Defaults to dev.azure.com",
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
          token: {
            title: "Authentication Token",
            type: "string",
            description: "The token to use for authorization.",
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
        server,
        organization,
        pipelineId,
        project,
        branch,
        pipelineParameters,
      } = ctx.input;

      const host = server ?? "dev.azure.com";
      const integrationConfig = integrations.azure.byHost(host);

      if (!integrationConfig) {
        throw new InputError(
          `No matching integration configuration for host ${host}, please check your integrations config`
        );
      }

      if (!integrationConfig.config.token && !ctx.input.token) {
        throw new InputError(`No token provided for Azure Integration ${host}`);
      }

      const token = ctx.input.token ?? integrationConfig.config.token!;

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

      // See the Azure DevOps documentation for more information about the REST API:
      // https://docs.microsoft.com/en-us/rest/api/azure/devops/pipelines/runs/run-pipeline?view=azure-devops-rest-7.0
      await fetch(
        `https://${host}/${organization}/${project}/_apis/pipelines/${pipelineId}/runs?api-version=7.0`,
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
      ).then((response) => {
        if (response.ok) {
          return response.json();
        } else {
          throw new Error(`Failed to run Azure pipeline. Status code ${response.status}.`);
        }
      }).then((json) => {
        const pipelineUrl = json._links.web.href;
        ctx.logger.info(`Successfully started Azure pipeline run: ${pipelineUrl}`);

        const pipelineRunId = json.id;

        // Poll the pipeline status until it completes.
        return checkPipelineStatus(host, organization, project, pipelineRunId, token);
      })
        .then((success) => {
          if (success) {
            ctx.logger.info(`Azure pipeline completed successfully.`);
          } else {
            ctx.logger.error(`Azure pipeline failed.`);
          }
        })
        .catch((error) => {
          // Handle any errors that occurred during the pipeline run or status check.
          ctx.logger.error(error.message);
        });
    },
  });
};
