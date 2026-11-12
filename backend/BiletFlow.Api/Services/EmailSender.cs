using System.Net;
using System.Net.Mail;
using System.Threading.Channels;

namespace BiletFlow.Api.Services;

public sealed record EmailMessage(string To, string Subject, string Body);

/// <summary>In-memory queue between request handlers and the background email sender.</summary>
public sealed class EmailQueue
{
    private readonly Channel<EmailMessage> channel = Channel.CreateBounded<EmailMessage>(
        new BoundedChannelOptions(1000) { FullMode = BoundedChannelFullMode.DropOldest });

    public void Enqueue(EmailMessage message) => channel.Writer.TryWrite(message);

    public IAsyncEnumerable<EmailMessage> ReadAllAsync(CancellationToken cancellationToken) =>
        channel.Reader.ReadAllAsync(cancellationToken);
}

/// <summary>
/// Sends queued transactional emails. With <c>Email:SmtpHost</c> configured (for example Mailpit in Docker Compose)
/// messages go to that SMTP server; otherwise they are written to the log so local development needs no mail server.
/// A failed email never fails the request that caused it.
/// </summary>
public sealed class EmailSenderBackgroundService(
    EmailQueue queue, IConfiguration configuration, ILogger<EmailSenderBackgroundService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var message in queue.ReadAllAsync(stoppingToken))
        {
            try
            {
                await SendAsync(message, stoppingToken);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                logger.LogWarning(exception, "Email to {Recipient} with subject '{Subject}' could not be sent.",
                    message.To, message.Subject);
            }
        }
    }

    private async Task SendAsync(EmailMessage message, CancellationToken cancellationToken)
    {
        var host = configuration["Email:SmtpHost"];
        if (string.IsNullOrWhiteSpace(host))
        {
            logger.LogInformation("Email (no SMTP configured) to {Recipient}: {Subject}\n{Body}",
                message.To, message.Subject, message.Body);
            return;
        }

        using var client = new SmtpClient(host, configuration.GetValue("Email:SmtpPort", 25))
        {
            EnableSsl = configuration.GetValue("Email:EnableSsl", false)
        };
        var username = configuration["Email:Username"];
        if (!string.IsNullOrWhiteSpace(username))
        {
            client.Credentials = new NetworkCredential(username, configuration["Email:Password"]);
        }

        using var mail = new MailMessage(
            configuration["Email:From"] ?? "BiletFlow <no-reply@biletflow.local>", message.To, message.Subject, message.Body);
        await client.SendMailAsync(mail, cancellationToken);
    }
}
