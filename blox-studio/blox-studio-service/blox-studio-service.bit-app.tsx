import { NodeServer } from '@bitdev/node.node-server';

export default NodeServer.from({
  name: 'blox-studio-service',
  mainPath: import.meta.resolve('./blox-studio-service.app-root.js'),
});
