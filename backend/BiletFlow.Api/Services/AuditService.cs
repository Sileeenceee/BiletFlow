using BiletFlow.Api.Data;
using BiletFlow.Api.Models;

namespace BiletFlow.Api.Services;

/// <summary>Adds audit rows to the current unit of work; they are saved together with the caller's changes.</summary>
public sealed class AuditService(AuthDbContext db)
{
    public void Add(AuditActionType action, string entityType, Guid? entityId, Guid? eventId, Guid? actorUserId, string description)
    {
        db.AuditLogs.Add(new AuditLog
        {
            ActionType = action,
            EntityType = entityType,
            EntityId = entityId,
            EventId = eventId,
            ActorUserId = actorUserId,
            Description = description.Length > 500 ? description[..500] : description,
            CreatedAt = DateTimeOffset.UtcNow
        });
    }
}
