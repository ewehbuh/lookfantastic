from celery import shared_task


@shared_task
def process_recurring_billing():
    # Recurring billing needs a separate provider subscription integration.
    # Never record a successful charge without provider confirmation.
    return {"processed": 0, "reason": "Recurring payment integration is not configured."}
