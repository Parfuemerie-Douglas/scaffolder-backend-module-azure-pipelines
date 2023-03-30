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

export const createAzurePipelineAction = (options: {
  integrations: ScmIntegrationRegistry;
}) => {
  const { integrations } = options;

  return createTemplateAction<{
    organization: string;
    project: string;
    folder: string;
    name: string;
    repositoryId: string;
    repositoryName: string;
    yamlPath?: string;
    token?: string;
  }>({
    id: "azure:pipeline:create",
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
          yamlPath: {
            type: "string",
            title: "Azure DevOps Pipelines Definition",
            description: "The location of the Azure DevOps Pipeline definition file. Defaults to /azure-pipelines.yaml",
          },
          token: {
            title: "Authenticatino Token",
            type: "string",
            description: "The token to use for authorization.",
          },
        },
      },
    },
    async handler(ctx) {
      const {
        organization,
        project,
        folder,
        name,
        repositoryId,
        yamlPath,
        repositoryName,
      } = ctx.input;

      const host = "dev.azure.com";
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

      ctx.logger.info(
        `Creating an Azure pipeline for the repository ${repositoryName} with the ID ${repositoryId}.`
      );

      // See the Azure DevOps documentation for more information about the REST API:
      // https://docs.microsoft.com/en-us/rest/api/azure/devops/pipelines/pipelines/create?view=azure-devops-rest-6.1
      await fetch(
        `https://dev.azure.com/${organization}/${project}/_apis/pipelines?api-version=6.1-preview.1`,
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
          body: JSON.stringify({
            folder: folder,
            name: name,
            configuration: {
              type: "yaml",
              path: yamlPath || "/azure-pipelines.yaml",
              repository: {
                id: repositoryId,
                name: repositoryName,
                type: "azureReposGit",
              },
            },
          }),
        }
      )
        .then((response) => {
          if (response.ok) {
            ctx.logger.info(
              `Successfully created ${name} Azure pipeline in ${folder}.`
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
          ctx.output("pipelineUrl", data._links.web.href);
        });
    },
  });
};
