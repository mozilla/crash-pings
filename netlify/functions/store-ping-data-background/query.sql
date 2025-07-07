select
    crash_app_channel as channel,
    metrics.string.crash_process_type as process,
    metrics.string_list.crash_utility_actors_name[SAFE_OFFSET(0)] as ipc_actor,
    client_info.client_id as clientid,
    document_id as crashid,
    crash_app_display_version as version,
    normalized_os as os,
    normalized_os_version as osversion,
    client_info.architecture as arch,
    STRING(DATE(metrics.datetime.crash_time)) as date,
    metrics.string.crash_moz_crash_reason as reason,
    crash_type as type,
    metrics.string.crash_minidump_sha256_hash as minidump_sha256_hash,
    metrics.boolean.crash_startup as startup_crash,
    crash_app_build as build_id,
    signature,
from moz-fx-data-shared-prod.crash_ping_ingest_external.ingest_output 
join telemetry.firefox_crashes using (document_id, submission_timestamp)
where
    DATE(submission_timestamp) = @date
