// Public service exports keep the Fastify adapter thin and give integration
// callers one stable import for the tenant-scoped catalog and coverage work.
export {
  CatalogNotFoundError,
  CatalogService,
  CoverageService,
} from '../../packages/domain/catalog.ts';
