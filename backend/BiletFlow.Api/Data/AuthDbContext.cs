using BiletFlow.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace BiletFlow.Api.Data;

public sealed class AuthDbContext(DbContextOptions<AuthDbContext> options) : DbContext(options)
{
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<AuthToken> AuthTokens => Set<AuthToken>();
    public DbSet<OrganizerProfile> OrganizerProfiles => Set<OrganizerProfile>();
    public DbSet<Event> Events => Set<Event>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AppUser>(entity =>
        {
            entity.HasKey(user => user.Id);
            entity.HasIndex(user => user.Email).IsUnique();
            entity.Property(user => user.Email).HasMaxLength(320).IsRequired();
            entity.Property(user => user.PasswordHash).IsRequired();
            entity.Property(user => user.Role).HasConversion<string>().HasMaxLength(32);
            entity.HasOne(user => user.OrganizerProfile)
                .WithOne(profile => profile.User)
                .HasForeignKey<OrganizerProfile>(profile => profile.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AuthToken>(entity =>
        {
            entity.HasKey(token => token.Id);
            entity.HasIndex(token => new { token.UserId, token.Type, token.TokenHash });
            entity.Property(token => token.Type).HasConversion<string>().HasMaxLength(32);
            entity.HasOne(token => token.User).WithMany().HasForeignKey(token => token.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<OrganizerProfile>(entity =>
        {
            entity.HasKey(profile => profile.Id);
            entity.HasIndex(profile => profile.UserId).IsUnique();
            entity.Property(profile => profile.BusinessName).HasMaxLength(200).IsRequired();
            entity.Property(profile => profile.DisplayName).HasMaxLength(120).IsRequired();
            entity.Property(profile => profile.ContactEmail).HasMaxLength(320);
            entity.Property(profile => profile.PhoneNumber).HasMaxLength(30);
            entity.Property(profile => profile.Bio).HasMaxLength(2000);
            entity.Property(profile => profile.Website).HasMaxLength(500);
        });

        modelBuilder.Entity<Event>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Title).HasMaxLength(200).IsRequired();
            entity.Property(e => e.Slug).HasMaxLength(200).IsRequired();
            entity.Property(e => e.Description).HasMaxLength(4000).IsRequired();
            entity.Property(e => e.Venue).HasMaxLength(250).IsRequired();
            entity.Property(e => e.City).HasMaxLength(120).IsRequired();
            entity.HasIndex(e => e.Slug).IsUnique();
            entity.HasOne(e => e.Organizer)
                .WithMany(user => user.Events)
                .HasForeignKey(e => e.OrganizerId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}