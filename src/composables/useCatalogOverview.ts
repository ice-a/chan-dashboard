import { ref } from 'vue';
import type { CatalogSummary, ResearchBrief } from '../../shared/catalog';
import type { ScanSummary } from '../../server/storage/researchStore';

export interface CatalogOverview {
  summary: CatalogSummary | null;
  latestScan: ScanSummary | null;
  research: ResearchBrief | null;
  driver: 'client' | 'server';
}

const overview = ref<CatalogOverview>({ summary: null, latestScan: null, research: null, driver: 'server' });
const loaded = ref(false);
let inflight: Promise<CatalogOverview> | null = null;

/** Shared, cached view of /api/catalog/summary used by the hero and the scan center. */
export function useCatalogOverview() {
  async function refresh(): Promise<CatalogOverview> {
    inflight ??= fetch('/api/catalog/summary')
      .then((response) => response.json())
      .then((body: { summary?: CatalogSummary; latestScan?: ScanSummary | null; research?: ResearchBrief | null; driver?: 'client' | 'server' }) => {
        overview.value = { summary: body.summary ?? null, latestScan: body.latestScan ?? null, research: body.research ?? null, driver: body.driver ?? 'server' };
        loaded.value = true;
        return overview.value;
      })
      .catch(() => overview.value)
      .finally(() => { inflight = null; });
    return inflight;
  }
  return { overview, loaded, refresh };
}
