# scaffolder-backend-module-azure-pipelines

Welcome to the Microsoft Azure pipeline actions for the `scaffolder-backend`.

This plugin contains a collection of actions:

- `azure:pipeline:create`
- `azure:pipeline:run`
- `azure:pipeline:permit`

It utilizes Azure DevOps REST APIs to
[create](https://docs.microsoft.com/en-us/rest/api/azure/devops/pipelines/pipelines/create?view=azure-devops-rest-6.1),
[run](https://docs.microsoft.com/en-us/rest/api/azure/devops/pipelines/runs/run-pipeline?view=azure-devops-rest-6.1),
and
[authorize](https://docs.microsoft.com/en-us/rest/api/azure/devops/approvalsandchecks/pipeline-permissions/update-pipeline-permisions-for-resource?view=azure-devops-rest-7.1)
Azure pipelines.

## Getting started

Create your Backstage application using the Backstage CLI as described here:
<https://backstage.io/docs/getting-started/create-an-app>.

> Note: If you are using this plugin in a Backstage monorepo that contains the
> code for `@backstage/plugin-scaffolder-backend`, you need to modify your
> internal build processes to transpile files from the `node_modules` folder as
> well.

You need to configure the actions in your backend:

## From your Backstage root directory

```sh
# From your Backstage root directory
yarn add --cwd packages/backend @parfuemerie-douglas/scaffolder-backend-module-azure-pipelines
```

Configure the actions (you can check the
[docs](https://backstage.io/docs/features/software-templates/writing-custom-actions#registering-custom-actions)
to see all options):

```typescript
// packages/backend/src/plugins/scaffolder.ts

import {
  createAzurePipelineAction,
  permitAzurePipelineAction,
  runAzurePipelineAction,
} from "@parfuemerie-douglas/scaffolder-backend-module-azure-pipelines";

const actions = [
  createAzurePipelineAction({ integrations }),
  permitAzurePipelineAction({ integrations }),
  runAzurePipelineAction({ integrations }),
  ...createBuiltInActions({
    containerRunner,
    catalogClient,
    integrations,
    config: env.config,
    reader: env.reader,
  }),
];

return await createRouter({
  containerRunner,
  catalogClient,
  actions,
  logger: env.logger,
  config: env.config,
  database: env.database,
  reader: env.reader,
});
```

The Azure pipeline actions use an [Azure PAT (personal access
token)](https://docs.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate)
for authorization. The PAT requires `Read & execute` permission for `Build` for
the `azure:pipeline:create` and `azure:pipeline:run` actions. For the
`azure:pipeline:permit` action the PAT requires `Read, query, & manage`
permission for `Service Connections`. Simply add the PAT to your
`app-config.yaml`:

```yaml
# app-config.yaml

integrations:
  azure:
    - host: dev.azure.com
      token: ${AZURE_TOKEN}
```

Read more on integrations in Backstage in the [Integrations
documentation](https://backstage.io/docs/integrations/).

## Using the template

After loading and configuring the Azure pipeline template actions, you can use
the actions in your template:

```yaml
# template.yaml

apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: create-azure-pipeline-demo
  title: Create Azure Pipeline Test
  description: Create Azure pipeline example
spec:
  owner: parfuemerie-douglas
  type: service

  parameters:
    - title: Fill in some steps
      required:
        - name
        - owner
      properties:
        name:
          title: Project name
          type: string
          description: Choose a unique project name.
          ui:field: EntityNamePicker
          ui:autofocus: true
        owner:
          title: Owner
          type: string
          description: Select an owner for the Backstage component.
          ui:field: OwnerPicker
          ui:options:
            allowedKinds:
              - Group
    - title: Choose a location
      description: >-
        Organization is an Azure DevOps organization. Owner is an Azure DevOps project.
        Repository is the name of the repository Backstage will create for you.
      required:
        - repoUrl
      properties:
        repoUrl:
          title: Repository Location
          type: string
          ui:field: RepoUrlPicker
          ui:options:
            allowedHosts:
              - dev.azure.com
    - title: Choose Pipeline Parameters
      description: Please select some pipeline parameters
      properties:
        pipelineParameters:
          title: Pipeline Parameters
          type: object
          properties:
            name:
              type: string
            id:
              type: number
            foo:
              type: string
***note these properties for parameters are just examples, you can use whatever key values that your pipeline will accept! (note if the pipeline doesnt have these parameters configured it will return a 400 error"

  steps:
    - id: fetch
      name: Template Skeleton
      action: fetch:template
      input:
        url: ./skeleton
        values:
          name: ${{ parameters.name }}
          destination: ${{ parameters.repoUrl | parseRepoUrl }}
          owner: ${{ parameters.owner }}

    - id: publish
      name: Publish
      action: publish:azure
      input:
        allowedHosts: ["dev.azure.com"]
        description: This is ${{ parameters.name }}
        repoUrl: ${{ parameters.repoUrl }}

    - id: createAzurePipeline
      name: Create Azure Pipeline
      action: azure:pipeline:create
      input:
        organization: ${{ (parameters.repoUrl | parseRepoUrl)['organization'] }}
        project: ${{ (parameters.repoUrl | parseRepoUrl)['owner'] }}
        folder: "my-azure-pipelines-folder"
        name: ${{ parameters.name }}
        repositoryId: ${{ steps.publish.output.repositoryId }}
        repositoryName: ${{ (parameters.repoUrl | parseRepoUrl)['repo'] }}
        yamlPath: <optional value to your azure pipelines yaml file, defaults to ./azure-pipelines.yaml>

    - id: runAzurePipeline
      name: Run Azure Pipeline
      action: azure:pipeline:run
      input:
        organization: ${{ (parameters.repoUrl | parseRepoUrl)['organization'] }}
        pipelineId: ${{ steps.createAzurePipeline.output.pipelineId }}
        project: ${{ (parameters.repoUrl | parseRepoUrl)['owner'] }}

    - id: permitAzurePipeline
      name: Change Azure Pipeline Permissions
      action: azure:pipeline:permit
      input:
        organization: ${{ (parameters.repoUrl | parseRepoUrl)['organization'] }}
        project: ${{ (parameters.repoUrl | parseRepoUrl)['owner'] }}
        resourceId: <serviceEndpointId>
        resourceType: endpoint
        authorized: true
        pipelineId: ${{ steps.createAzurePipeline.output.pipelineId }}

    - id: register
      name: Register
      action: catalog:register
      input:
        repoContentsUrl: ${{ steps.publish.output.repoContentsUrl }}
        catalogInfoPath: "/catalog-info.yaml"

  output:
    links:
      - title: Repository
        url: ${{ steps.publish.output.remoteUrl }}
      - title: Pipeline
        url: ${{ steps.createAzurePipeline.output.pipelineUrl }}
      - title: Open in catalog
        icon: catalog
        entityRef: ${{ steps.register.output.entityRef }}
```

**_Note_**: The `azure:pipeline:permit` action authorizes/unauthorizes a
pipeline for a given resource. To authorize a pipeline for a [service
endpoint](https://docs.microsoft.com/en-us/azure/virtual-network/virtual-network-service-endpoints-overview)
set `resourceType` to `endpoint`, provide `resourceId` with the service endpoint
ID (replace `<serviceEndpointId>` in the example code above), and set authorized
to `true`.

You can find a list of all registred actions including their parameters at the
`/create/actions` route in your Backstage application.
