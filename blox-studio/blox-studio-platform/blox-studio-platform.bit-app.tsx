import { Platform } from '@bitdev/platforms.platform';

const BloxStudioService = import.meta.resolve('@nikethbhat4thh/blox-studio.blox-studio-service');
const BloxStudioApp = import.meta.resolve('@nikethbhat4thh/blox-studio.blox-studio-app');
const PlatformGateway = import.meta.resolve('@bitdev/platforms.backend.gateway-server');

/**
 * Blox Studio platform: composes the studio web app, the studio service and the API gateway.
 */
export const BloxStudioPlatform = Platform.from({
  name: 'blox-studio-platform',

  frontends: {
    main: BloxStudioApp,
    mainPortRange: [3000, 3100]
  },

  backends: {
    main: PlatformGateway,
    services: [
      BloxStudioService
    ]
  },
});

export default BloxStudioPlatform;
