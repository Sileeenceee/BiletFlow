
using System.Security.Claims;
using System.Text;
using BiletFlow.Api.Data;
using BiletFlow.Api.Models;
using BiletFlow.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace BiletFlow.Api;

public class Program
{
    public static async Task Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);

        var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("ConnectionStrings:DefaultConnection is not configured.");
        var jwtSigningKey = builder.Configuration["Jwt:SigningKey"]
            ?? throw new InvalidOperationException("Jwt:SigningKey is not configured.");

        builder.Services.AddDbContext<AuthDbContext>(options => options.UseNpgsql(connectionString));
        builder.Services.AddScoped<IPasswordHasher<AppUser>, PasswordHasher<AppUser>>();
        builder.Services.AddScoped<AuthService>();
        builder.Services.AddScoped<OrganizerProfileService>();
        builder.Services.AddScoped<EventService>();
        builder.Services.AddScoped<AuditService>();
        builder.Services.AddScoped<PromoCampaignService>();
        builder.Services.AddScoped<TicketingService>();
        builder.Services.AddScoped<TicketDocumentService>();
        builder.Services.AddScoped<TicketVerificationService>();
        builder.Services.AddScoped<SupportService>();
        builder.Services.AddScoped<NotificationService>();
        builder.Services.AddScoped<PlatformSettingsService>();
        builder.Services.AddScoped<SeatingService>();
        builder.Services.AddScoped<PaidSalesService>();
        builder.Services.AddScoped<AnalyticsService>();
        builder.Services.AddScoped<CalendarService>();
        builder.Services.AddScoped<AdminService>();
        builder.Services.AddScoped<DataSeeder>();
        builder.Services.AddSingleton<EmailQueue>();
        builder.Services.AddHostedService<EmailSenderBackgroundService>();
        builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSigningKey)),
                    ValidateIssuer = false,
                    ValidateAudience = false,
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.FromSeconds(30)
                };
                options.Events = new JwtBearerEvents
                {
                    // Suspension and role changes take effect on the next request instead of when the token expires.
                    OnTokenValidated = async context =>
                    {
                        var principal = context.Principal!;
                        var subject = principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? principal.FindFirstValue("sub");
                        if (!Guid.TryParse(subject, out var userId))
                        {
                            context.Fail("Invalid subject.");
                            return;
                        }

                        var db = context.HttpContext.RequestServices.GetRequiredService<AuthDbContext>();
                        var user = await db.Users.AsNoTracking().Where(candidate => candidate.Id == userId)
                            .Select(candidate => new { candidate.Role, candidate.IsSuspended })
                            .SingleOrDefaultAsync(context.HttpContext.RequestAborted);
                        if (user is null || user.IsSuspended)
                        {
                            context.Fail("The account is suspended or no longer exists.");
                            return;
                        }

                        if (principal.Identity is ClaimsIdentity identity)
                        {
                            foreach (var claim in identity.FindAll(identity.RoleClaimType).ToList()) identity.RemoveClaim(claim);
                            identity.AddClaim(new Claim(identity.RoleClaimType, user.Role.ToString()));
                        }
                    }
                };
            });
        builder.Services.AddAuthorizationBuilder()
            .AddPolicy("OrganizerOnly", policy => policy.RequireRole(nameof(UserRole.Organizer), nameof(UserRole.PlatformAdmin)))
            .AddPolicy("PlatformAdminOnly", policy => policy.RequireRole(nameof(UserRole.PlatformAdmin)));
        builder.Services.AddCors(options =>
        {
            options.AddPolicy("Frontend", policy =>
            {
                policy.AllowAnyHeader().AllowAnyMethod();
                var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
                if (allowedOrigins.Length > 0) policy.WithOrigins(allowedOrigins);
            });
        });
        builder.Services.AddControllers();
        builder.Services.AddEndpointsApiExplorer();
        builder.Services.AddSwaggerGen();

        var app = builder.Build();

        // Configure the HTTP request pipeline.
        if (app.Environment.IsDevelopment())
        {
            app.UseSwagger();
            app.UseSwaggerUI(options =>
            {
                options.SwaggerEndpoint("/swagger/v1/swagger.json", "BiletFlow API v1");
                options.RoutePrefix = "swagger";
            });
        }

        using (var scope = app.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<AuthDbContext>().Database.MigrateAsync();
            await scope.ServiceProvider.GetRequiredService<DataSeeder>().SeedAsync();
        }

        app.UseCors("Frontend");
        app.UseAuthentication();
        app.UseAuthorization();
        app.UseHttpsRedirection();
        // Emails collected during a request are sent only if the request succeeded (its changes were committed).
        app.Use(async (context, next) =>
        {
            await next();
            if (context.Response.StatusCode < 400)
            {
                context.RequestServices.GetRequiredService<NotificationService>().FlushEmails();
            }
        });
        app.MapGet("/health", async (AuthDbContext db) =>
            await db.Database.CanConnectAsync() ? Results.Ok(new { status = "Healthy" }) : Results.StatusCode(503));
        app.MapControllers();

        app.Run();
    }
}
