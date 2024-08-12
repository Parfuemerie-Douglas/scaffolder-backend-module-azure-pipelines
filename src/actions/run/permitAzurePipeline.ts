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

export const permitAzurePipelineAction = (options: {
  integrations: ScmIntegrationRegistry;
}) => {
  const { integrations } = options;

  return createTemplateAction<{
    permitsApiVersion: string
    server: string;
    organization: string;
    project: string;
    resourceId: string;
    resourceType: string;
    authorized: boolean;
    pipelineId: string;
    token?: string;
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
          permitsApiVersion: {
            type: "string",
            title: "Permits API version",
            description: "The Azure Permits Pipeline API version to use. Defaults to 7.1-preview.1",
          },
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
          authorized: {
            type: "boolean",
            title: "Authorized",
            description: "A true or false authorization indicator.",
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
      const {
        permitsApiVersion,
        server,
        organization,
        project,
        resourceId,
        resourceType,
        authorized,
        pipelineId,
      } = ctx.input;

      const host = server ?? "dev.azure.com";
      const apiVersion = permitsApiVersion ?? "7.1-preview.1";
      const provider = DefaultAzureDevOpsCredentialsProvider.fromIntegrations(integrations);
      const url = `https://${host}/${ctx.input.organization}`;
      const credentials = await provider.getCredentials({ url: url });
      const token = ctx.input.token ?? credentials?.token;

      if (ctx.input.authorized === true) {
        ctx.logger.info(
          `Authorizing Azure pipeline with ID ${pipelineId} for ${resourceType} with ID ${resourceId}.`
        );
      } else {
        ctx.logger.info(
          `Unauthorizing Azure pipeline with ID ${pipelineId} for ${resourceType} with ID ${resourceId}.`
        );
      }

      const fetchModule = await import("node-fetch");
      const fetch: typeof fetchModule.default = fetchModule.default;
      // See the Azure DevOps documentation for more information about the REST API:
      // https://docs.microsoft.com/en-us/rest/api/azure/devops/approvalsandchecks/pipeline-permissions/update-pipeline-permisions-for-resource?view=azure-devops-rest-7.1
      await fetch(
        `https://${host}/${organization}/${project}/_apis/pipelines/pipelinepermissions/${resourceType}/${resourceId}?api-version=${apiVersion}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Basic ${Buffer.from(`PAT:${token}`).toString(
              "base64"
            )}`,
            "X-TFS-FedAuthRedirect": "Suppress",
          },
          body: JSON.stringify({
            pipelines: [
              {
                authorized: authorized,
                id: parseInt(pipelineId, 10),
              },
            ],
          }),
        }
      ).then((response: any) => {
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
