create temp function signature_distributions(
    use_client_count BOOL,
    params STRUCT<
        start_date STRING,
        end_date STRING,
        channel STRING,
        version STRING, -- regexp string
        buildid STRING, -- regexp string
        process STRING,
        os STRING,
        os_version STRING, -- regexp string
        arch STRING
    >
) as (
    ARRAY(
    with signature_counts as (
    select
        signature,
        DATE(submission_timestamp) as date,
        IF(use_client_count,COUNT(distinct client_info.client_id),COUNT(*)) as count
    from
        telemetry.firefox_crashes
    join
        `moz-fx-data-shared-prod.crash_ping_ingest_external.ingest_output` using (document_id, submission_timestamp)
    where
        submission_timestamp BETWEEN TIMESTAMP(params.start_date) and TIMESTAMP(params.end_date)
        and (params.channel is null or crash_app_channel = params.channel)
        and (params.version is null or REGEXP_CONTAINS(crash_app_display_version, params.version))
        and (params.buildid is null or REGEXP_CONTAINS(crash_app_build, params.buildid))
        and (params.process is null or metrics.string.crash_process_type = params.process)
        and (params.os is null or normalized_os = params.os)
        and (params.os_version is null or REGEXP_CONTAINS(normalized_os_version, params.os_version))
        and (params.arch is null or client_info.architecture = params.arch)
    group by all
    )
    
    select as struct
        signature,
        AVG(count) as average,
        STDDEV(count) as stddev,
        COUNT(*) as samples
    from signature_counts
    where (signature is not null and signature != '' and signature != 'None')
    group by all
    order by average desc
    )
);

with 

baseline as (
select * from UNNEST(signature_distributions(@use_client_count, @baseline))
),

target as (
-- Change these parameters for target
select * from UNNEST(signature_distributions(@use_client_count, @target))
),

top_crash_signatures as (
    (select signature from baseline limit @top_crash_limit)
    union distinct
    (select signature from target limit @top_crash_limit)
),

signature_stats as
(select
    signature,
    b.average as baseline_average,
    b.stddev as baseline_stddev,
    t.average as target_average,
    t.stddev as target_stddev,
    -- Calculate welch's t-test, as we don't assume similar sample sizes nor variances
    (t.average - b.average) / SQRT(POW(t.stddev, 2) / t.samples + POW(b.stddev, 2) / b.samples) as welch_t,
    POW(POW(t.stddev, 2) / t.samples + POW(b.stddev, 2) / b.samples, 2) / (POW(t.stddev, 4) / (POW(t.samples, 2) * (t.samples - 1)) + POW(b.stddev, 4) / (POW(b.samples, 2) * (b.samples - 1))) as welch_dof
from baseline as b
full join target as t using (signature)
right join top_crash_signatures using (signature)
)

select
    signature,
    baseline_average,
    baseline_stddev,
    target_average,
    target_stddev,
    welch_t
from signature_stats
where
    -- Assume dof = infinity (a normal distribution). In practice, it's often around 40, but the t values are very close to normal as dof increases.
    -- https://en.wikipedia.org/wiki/Student%27s_t-distribution#Table_of_selected_values
    -- one-sided, 99% confidence, ABS to test in either direction
    ABS(welch_t) > 2.326
    -- If a signature is only present on one side or the other, welsh_t will be null
    or welch_t is null
order by baseline_average is not null, welch_t desc
