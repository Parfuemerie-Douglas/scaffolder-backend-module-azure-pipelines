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

export const permitAzurePipelineAction = (azurePersonalAccessToken: string) => {
  return createTemplateAction<{
    organization: string;
    project: string;
    resourceId: string;
    resourceType: string;
    authorized: boolean;
    pipelineId: string;
  }>({
    id: "azure:pipeline:permit",
    schema: {
      input: {
        required: [
          "organization",
          "project",
          "resourceId",
          "resourceType",
          "authorized",
          "pipelineId",
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
          resourceId: {
            type: "string",
            title: "Resource ID",
            description: "The resource ID.",
          },
          resourceType: {
            type: "string",
            title: "Resource Type",
            description: "The type of the resource (e.g. endpoint).",
          },
          pipelineId: {
            type: "string",
            title: "Pipeline ID",
            description: "The pipeline ID.",
          },
        },
      },
    },
    async handler(ctx) {
      if (ctx.input.authorized == true) {
        ctx.logger.info(
          `Authorizing Azure pipeline with ID ${ctx.input.pipelineId} for ${ctx.input.resourceType} with ID ${ctx.input.resourceId}.`
        );
      } else {
        ctx.logger.info(
          `Unauthorizing Azure pipeline with ID ${ctx.input.pipelineId} for ${ctx.input.resourceType} with ID ${ctx.input.resourceId}.`
        );
      }

      // See the Azure DevOps documentation for more information about the REST API:
      // https://docs.microsoft.com/en-us/rest/api/azure/devops/approvalsandchecks/pipeline-permissions/update-pipeline-permisions-for-resource?view=azure-devops-rest-7.1
      await fetch(
        `https://dev.azure.com/${ctx.input.organization}/${ctx.input.project}/_apis/pipelines/pipelinepermissions/${ctx.input.resourceType}/${ctx.input.resourceId}?api-version=7.1-preview.1`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Basic ${Buffer.from(
              `PAT:${azurePersonalAccessToken}`
            ).toString("base64")}`,
            "X-TFS-FedAuthRedirect": "Suppress",
          },
          body: JSON.stringify({
            pipelines: [
              {
                authorized: ctx.input.authorized,
                id: parseInt(ctx.input.pipelineId),
              },
            ],
          }),
        }
      ).then(function (response) {
        if (response.ok) {
          ctx.logger.info(
            `Successfully changed the Azure pipeline permissions.`
          );
        } else {
          ctx.logger.error(
            `Failed to change the Azure pipeline permissions. Status code ${response.status}.`
          );
        }
      });
    },
  });
};
