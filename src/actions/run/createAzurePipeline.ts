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

export const createAzurePipelineAction = (azurePersonalAccessToken: string) => {
  return createTemplateAction<{
    organization: string;
    project: string;
    folder: string;
    name: string;
    repositoryId: string;
    repositoryName: string;
  }>({
    id: "run:create:azure:pipeline",
    schema: {
      input: {
        required: [
          "organization",
          "project",
          "folder",
          "name",
          "repositoryId",
          "repositoryName",
        ],
        type: "object",
        properties: {
          organization: {
            type: "string",
            title: "Organization",
            description: "The name of the Azure DevOps organization.",
          },
          project: {
            type: "string",
            title: "Project",
            description: "The name of the Azure project.",
          },
          folder: {
            type: "string",
            title: "Folder",
            description: "The name of the folder of the pipeline.",
          },
          name: {
            type: "string",
            title: "Name",
            description: "The name of the pipeline.",
          },
          repositoryId: {
            type: "string",
            title: "Repository ID",
            description: "The ID of the repository.",
          },
          repositoryName: {
            type: "string",
            title: "Repository Name",
            description: "The name of the repository.",
          },
        },
      },
    },
    async handler(ctx) {
      ctx.logger.info(
        `Creating an Azure pipeline for the repository ${ctx.input.repositoryName} with the ID ${ctx.input.repositoryId}.`
      );

      // See the Azure DevOps documentation for more information about the REST API:
      // https://docs.microsoft.com/en-us/rest/api/azure/devops/pipelines/pipelines/create?view=azure-devops-rest-6.1
      await fetch(
        `https://dev.azure.com/${ctx.input.organization}/${ctx.input.project}/_apis/pipelines?api-version=6.1-preview.1`,
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
            folder: ctx.input.folder,
            name: ctx.input.name,
            configuration: {
              type: "yaml",
              path: "/azure-pipelines.yaml",
              repository: {
                id: ctx.input.repositoryId,
                name: ctx.input.repositoryName,
                type: "azureReposGit",
              },
            },
          }),
        }
      )
        .then((response) => {
          if (response.status === 200) {
            ctx.logger.info(
              `Successfully created ${ctx.input.name} Azure pipeline in ${ctx.input.folder}.`
            );
          } else {
            ctx.logger.error(
              `Failed to create Azure pipeline. Status code ${response.status}.`
            );
          }

          return response.json();
        })
        .then((data) => {
          ctx.logger.info(`The Azure pipeline ID is ${data.id}.`);

          ctx.output("pipelineId", data.id.toString());
        });
    },
  });
};
