import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface Link {
  slug: string;
  url: string;
  clicks: number;
  createdAt: string;
  lastClickedAt: string | null;
}

interface Row {
  slug: string;
  url: string;
  clicks: number;
  created_at: string;
  last_clicked_at: string | null;
}

const toLink = (r: Row): Link => ({
  slug: r.slug,
  url: r.url,
  clicks: r.clicks,
  createdAt: r.created_at,
  lastClickedAt: r.last_clicked_at,
});

export class SlugTakenError extends Error {}

export class LinkStore {
  readonly db: Database.Database;
  private stmts;

  constructor(path = ':memory:') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS links (
        slug            TEXT PRIMARY KEY COLLATE NOCASE,
        url             TEXT NOT NULL,
        clicks          INTEGER NOT NULL DEFAULT 0,
        created_at      TEXT NOT NULL,
        last_clicked_at TEXT
      )
    `);
    this.stmts = {
      insert: this.db.prepare<[string, string, string]>(
        'INSERT INTO links (slug, url, created_at) VALUES (?, ?, ?)',
      ),
      get: this.db.prepare<[string], Row>('SELECT * FROM links WHERE slug = ?'),
      hit: this.db.prepare<[string, string], Row>(
        `UPDATE links SET clicks = clicks + 1, last_clicked_at = ?
         WHERE slug = ? RETURNING *`,
      ),
      exists: this.db.prepare<[string], { n: number }>('SELECT 1 AS n FROM links WHERE slug = ?'),
    };
  }

  create(slug: string, url: string, now = new Date()): Link {
    try {
      this.stmts.insert.run(slug, url, now.toISOString());
    } catch (err) {
      if ((err as { code?: string }).code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
        throw new SlugTakenError(slug);
      }
      throw err;
    }
    return this.get(slug)!;
  }

  get(slug: string): Link | undefined {
    const row = this.stmts.get.get(slug);
    return row && toLink(row);
  }

  has(slug: string): boolean {
    return this.stmts.exists.get(slug) !== undefined;
  }

  /** Counts a click and returns the link, or undefined if the slug is unknown. */
  hit(slug: string, now = new Date()): Link | undefined {
    const row = this.stmts.hit.get(now.toISOString(), slug);
    return row && toLink(row);
  }

  close() {
    this.db.close();
  }
}
