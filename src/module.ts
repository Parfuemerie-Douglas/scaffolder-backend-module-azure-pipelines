import { scaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node/alpha';
import {
  createBackendModule,
  coreServices
} from '@backstage/backend-plugin-api';
import { ScmIntegrations } from '@backstage/integration';

import {
  createAzurePipelineAction,
  permitAzurePipelineAction,
  runAzurePipelineAction
} from './actions';

export const scaffolderModuleAzurePipelines = createBackendModule({
  pluginId: 'scaffolder',
  moduleId: 'azure-pipelines',
  register(env) {
    env.registerInit({
      deps: {
        scaffolder: scaffolderActionsExtensionPoint,
        logger: coreServices.logger,
        config: coreServices.rootConfig,
        discovery: coreServices.discovery,
        reader: coreServices.urlReader,
      },
      async init({ scaffolder, config}) {
        
        const integrations = ScmIntegrations.fromConfig(config);

        scaffolder.addActions(
          createAzurePipelineAction({
            integrations,
          }),
          permitAzurePipelineAction({
            integrations,
          }),
          runAzurePipelineAction({
            integrations,
          })
        );
      },
    });
  },
});
