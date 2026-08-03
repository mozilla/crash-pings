with
signature_counts as (
    select
        signature,
        metrics.string.crash_process_type as process_type,
        normalized_os as os,
        SAFE_CAST(REGEXP_SUBSTR(crash_app_display_version, '[0-9]+') as INT64) < @major_version as baseline,
        DATE(submission_timestamp) as date,
        COUNT(distinct client_info.client_id) as count
    from
        telemetry.firefox_crashes
    join
        `moz-fx-data-shared-prod.crash_ping_ingest_external.ingest_output` using (document_id, submission_timestamp)
    where
        submission_timestamp >= CURRENT_TIMESTAMP() - INTERVAL 60 DAY
        and crash_app_channel = 'release'
    group by all
)
, signature_distributions as (
    select
        signature,
        process_type,
        os,
        baseline,
        AVG(count) as average,
        STDDEV(count) as stddev,
        MAX(count) as max,
        COUNT(*) as samples
    from signature_counts
    where (signature is not null and signature != '' and signature != 'None')
    group by all
)
, top_crashers as (
    select
        *,
        ROW_NUMBER() OVER (
            partition by os, process_type, baseline
            order by max desc
        ) as top_crasher_rank
    from signature_distributions
)

select *
from top_crashers
right join (select os, process_type, signature from top_crashers where top_crasher_rank <= 20) using (os, process_type, signature)
