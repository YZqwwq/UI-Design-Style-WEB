export interface Design {
  id: string;
  name: string;
  english: string;
  category: string;
  tag: string;
  tone: string;
  colors: string[];
  description: string;
  layout: string;
  typography: string;
  surface: string;
  interaction: string;
  use: string;
  label: string;
  subtitle: string;
  code: string;
}

export interface Filters {
  category?: string;
  tag?: string;
  query?: string;
  limit?: number;
  offset?: number;
}

export interface CatalogPage {
  items: Design[];
  total: number;
}

export interface CatalogRepository {
  list(filters: Filters, ownerId: string): Promise<CatalogPage>;
  get(id: string, ownerId: string): Promise<Design | undefined>;
  metadata(ownerId: string): Promise<{ categories: string[]; tags: string[] }>;
  check(): Promise<void>;
}
