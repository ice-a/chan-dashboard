import handler from './market/[...path].ts';

export default { fetch: handler.fetch };
export const config = { runtime: 'nodejs' };
