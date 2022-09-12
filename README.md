# scaffolder-backend-module-azure-pipelines

Welcome to the Microsoft Azure pipelines actions for the `scaffolder-backend`.

This plugin contains a collection of actions:

- `azure:pipeline:create`
- `azure:pipeline:run`

It utilizes Azure DevOps REST APIs to [create](https://docs.microsoft.com/en-us/rest/api/azure/devops/pipelines/pipelines/create?view=azure-devops-rest-6.1) and [run](https://docs.microsoft.com/en-us/rest/api/azure/devops/pipelines/runs/run-pipeline?view=azure-devops-rest-6.1) Azure pipelines.

## Getting started

Create your Backstage application using the Backstage CLI as described here: <https://backstage.io/docs/getting-started/create-an-app>.

> Note: If you are using this plugin in a Backstage monorepo that contains the code for `@backstage/plugin-scaffolder-backend`, you need to modify your internal build processes to transpile files from the `node_modules` folder as well.

You need to configure the actions in your backend:

## From your Backstage root directory

```sh
# From your Backstage root directory
yarn add --cwd packages/backend @parfuemerie-douglas/scaffolder-backend-module-azure-pipelines
```

Configure the actions (you can check the [docs](https://backstage.io/docs/features/software-templates/writing-custom-actions#registering-custom-actions) to see all options):

```typescript
// packages/backend/src/plugins/scaffolder.ts

import { createAzurePipelineAction, runAzurePipelineAction } from '@parfuemerie-douglas/scaffolder-backend-module-azure-pipelines';

const actions = [
  createAzurePipelineAction(<azurePersonalAccessToken>),
  runAzurePipelineAction(<azurePersonalAccessToken>),
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

The `azure:pipeline:create` and `azure:pipeline:run` actions accepts an [Azure PAT (personal access token)](https://docs.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate) parameter which should be a string. The PAT requires `Read & execute` permission for `Build`. Simply replace `<azurePersonalAccessToken>` with your Azure PAT.

## Using the template

After loading and configuring the Azure pipeline template actions, you can use the actions in your template:

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
      description: Organization is an Azure DevOps organization. Owner is an Azure DevOps project. Repository is the name of the repository Backstage will create for you.
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

    - id: runAzurePipeline
      name: Run Azure Pipeline
      action: azure:pipeline:run
      input:
        organization: ${{ (parameters.repoUrl | parseRepoUrl)['organization'] }}
        pipelineId: ${{ steps.createAzurePipeline.output.pipelineId }}
        project: ${{ (parameters.repoUrl | parseRepoUrl)['owner'] }}

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
      - title: Open in catalog
        icon: catalog
        entityRef: ${{ steps.register.output.entityRef }}
```

You can also visit the `/create/actions` route in your Backstage application to find out more about the parameters these actions accepts when it's installed to configure how you like.
