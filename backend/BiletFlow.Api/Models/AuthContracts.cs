namespace BiletFlow.Api.Models;

public sealed record RegisterRequest(string Email, string Password, bool CreateOrganizerProfile = false);
public sealed record LoginRequest(string Email, string Password);
public sealed record VerifyEmailRequest(string Token);
public sealed record ForgotPasswordRequest(string Email);
public sealed record ResetPasswordRequest(string Token, string NewPassword);
public sealed record OrganizerProfileRequest(string BusinessName, string DisplayName, string? ContactEmail);
public sealed record CreateEventRequest(string Title, string Description, string Venue, string City, DateTimeOffset StartDateUtc, DateTimeOffset EndDateUtc, bool IsPublished = false, int? Capacity = null);
public sealed record RefreshRequest(string RefreshToken);
public sealed record AuthResponse(string AccessToken, DateTimeOffset ExpiresAt, Guid UserId, string Email, string Role, bool EmailConfirmed, string RefreshToken);
public sealed record DevelopmentTokenResponse(string? Token);