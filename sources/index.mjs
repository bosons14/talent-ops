import * as github from './repos/github.mjs';
import * as gitlab from './repos/gitlab.mjs';
import * as gitea from './repos/gitea.mjs';
import * as bitbucket from './repos/bitbucket.mjs';
import * as medium from './blogs/medium.mjs';
import * as substack from './blogs/substack.mjs';
import * as devto from './blogs/devto.mjs';
import * as hashnode from './blogs/hashnode.mjs';
import * as hackernews from './blogs/hackernews.mjs';
import * as feeds from './blogs/feeds.mjs';

export const SOURCES = { github, gitlab, gitea, bitbucket, medium, substack, devto, hashnode, hackernews, feeds };

export function enabledSources(cfg, { families = ['repos', 'blogs'], only } = {}) {
  return Object.values(SOURCES).filter((s) => {
    if (only?.length) return only.includes(s.name);
    return families.includes(s.family) && cfg.sources?.[s.name]?.enabled !== false && cfg.sources?.[s.name] != null;
  });
}
