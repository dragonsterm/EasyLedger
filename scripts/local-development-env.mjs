import { configureLocalDevelopmentEnvironment } from '../apps/api/localDevelopmentEnvironment.mjs';

// This preloader is only used by the explicit `npm run start:dev` command.
configureLocalDevelopmentEnvironment();
