namespace BiletFlow.Api.Models;

public enum UserRole { Attendee, Organizer, EventAdmin, PlatformAdmin }
public enum AuthTokenType { EmailVerification, PasswordReset }

public sealed class AppUser
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Email { get; set; }
    public required string PasswordHash { get; set; }
    public UserRole Role { get; set; } = UserRole.Attendee;
    public bool EmailConfirmed { get; set; }
    public bool IsSuspended { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class AuthToken
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public AppUser User { get; set; } = null!;
    public required AuthTokenType Type { get; set; }
    public required string TokenHash { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? UsedAt { get; set; }
}