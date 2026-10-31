/**
 * Audit Service
 * Database storage of audit logs has been removed as per production requirements.
 * This stub ensures zero Firestore writes, zero database storage overhead,
 * and zero network latency while maintaining type safety.
 */
export async function logAdminAction(
  _adminUid?: string,
  _action?: string,
  _entity?: string,
  _entityId?: string,
  _details?: Record<string, any>
): Promise<void> {
  // Deliberately a no-op: audit logs are not persisted to Cloud Firestore.
}
