// Public service exports keep the Fastify adapter thin and give integration
// callers one stable import for the tenant-scoped catalog and coverage work.
export {
  CatalogNotFoundError,
  CatalogService,
  CoverageService,
} from '../../packages/domain/catalog.ts';
export {
  DashboardService,
  type DashboardView,
  type LayoutItem,
  type SaveDashboardInput,
  type WidgetSpec,
} from '../../packages/domain/dashboards.ts';
export {
  ProposalService,
  SalesQueryService,
  VoiceSessionService,
  fetchAssemblyAiToken,
} from '../../packages/domain/voice.ts';
