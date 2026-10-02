export interface SavedView {
  id: string;
  resource: string;
  name: string;
  query: string;
}

/**
 * Saved views of a table. Not stored yet: Laravel has no endpoint for them, so the
 * sidebar shows none. The shape is kept so the dashboard's sidebar is unchanged.
 */
export async function listViews(_resource?: string): Promise<SavedView[]> {
  return [];
}
