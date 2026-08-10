create temp function StringNumCompare(a STRING, b STRING, selectregexp STRING) returns INT64 as (
    SAFE_CAST(REGEXP_SUBSTR(a, selectregexp) as INT64) - SAFE_CAST(REGEXP_SUBSTR(b, selectregexp) as INT64)
);

create temp function NumCompare(a STRING, b STRING) returns INT64 as (StringNumCompare(a, b, '[0-9]+'));

create temp function VersionLt(a STRING, b STRING) returns BOOL as (
    if(a is null or b is null, null,
        CONCAT(lpad(ifnull(SPLIT(a, '.')[safe_offset(0)], ''), 4, '0'), lpad(ifnull(SPLIT(a, '.')[safe_offset(1)], ''), 4, '0'), lpad(ifnull(SPLIT(a, '.')[safe_offset(2)], ''), 4, '0'))
        <
        CONCAT(lpad(ifnull(SPLIT(b, '.')[safe_offset(0)], ''), 4, '0'), lpad(ifnull(SPLIT(b, '.')[safe_offset(1)], ''), 4, '0'), lpad(ifnull(SPLIT(b, '.')[safe_offset(2)], ''), 4, '0'))
    )
);

with
signature_counts as (
    select
        signature,
        metrics.string.crash_process_type as process_type,
        normalized_os as os,
        case crash_app_channel
            when 'nightly' then coalesce(
                NumCompare(crash_app_display_version, @nightly_version) < 0,
                crash_app_build < @nightly_build
            )
            when 'beta' then coalesce(
                NumCompare(crash_app_display_version, @beta_version) < 0
                    or (NumCompare(crash_app_display_version, @beta_version) = 0
                        and StringNumCompare(crash_app_display_version, @beta_version, '[0-9.]+b([0-9]+)') < 0),
                crash_app_build < @beta_build
            )
            when 'release' then coalesce(
                VersionLt(crash_app_display_version, @release_version),
                crash_app_build < @release_build
            )
            when 'esr' then coalesce(
                VersionLt(crash_app_display_version, @esr_version),
                crash_app_build < @esr_build
            )
        end as baseline,
        DATE(submission_timestamp) as date,
        COUNT(distinct client_info.client_id) as count
    from
        telemetry.firefox_crashes
    join
        `moz-fx-data-shared-prod.crash_ping_ingest_external.ingest_output` using (document_id, submission_timestamp)
    where
        submission_timestamp >= CURRENT_TIMESTAMP() - INTERVAL 60 DAY
    group by all
    having baseline is not null
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
