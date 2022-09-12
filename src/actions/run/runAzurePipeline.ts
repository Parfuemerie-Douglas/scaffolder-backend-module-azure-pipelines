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

import { createTemplateAction } from "@backstage/plugin-scaffolder-backend";

import fetch from "node-fetch";

export const runAzurePipelineAction = (azurePersonalAccessToken: string) => {
  return createTemplateAction<{
    organization: string;
    pipelineId: string;
    project: string;
  }>({
    id: "azure:pipeline:run",
    schema: {
      input: {
        required: ["organization", "pipelineId", "project"],
        type: "object",
        properties: {
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
        },
      },
    },
    async handler(ctx) {
      ctx.logger.info(
        `Running Azure pipeline with the ID ${ctx.input.pipelineId}.`
      );

      // See the Azure DevOps documentation for more information about the REST API:
      // https://docs.microsoft.com/en-us/rest/api/azure/devops/pipelines/runs/run-pipeline?view=azure-devops-rest-6.1
      await fetch(
        `https://dev.azure.com/${ctx.input.organization}/${ctx.input.project}/_apis/pipelines/${ctx.input.pipelineId}/runs?api-version=6.1-preview.1`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Basic ${Buffer.from(
              `PAT:${azurePersonalAccessToken}`
            ).toString("base64")}`,
            "X-TFS-FedAuthRedirect": "Suppress",
          },
          body: JSON.stringify({
            resources: {
              repositories: {
                self: {
                  refName: "refs/heads/master",
                },
              },
            },
          }),
        }
      ).then(function (response) {
        if (response.ok) {
          ctx.logger.info(`Successfully ran Azure pipeline.`);
        } else {
          ctx.logger.error(
            `Failed to run Azure pipeline. Status code ${response.status}.`
          );
        }
      });
    },
  });
};
