with
desktop as
    (select
        IFNULL(metrics.string.crash_app_channel, client_info.app_channel) as channel,
        metrics.string.crash_process_type as process,
        metrics.string_list.crash_utility_actors_name[SAFE_OFFSET(0)] as ipc_actor,
        client_info.client_id as clientid,
        document_id as crashid,
        IFNULL(metrics.string.crash_app_display_version, client_info.app_display_version) as version,
        normalized_os as os,
        IF(normalized_os = 'Windows', CONCAT(normalized_os_version, "@", client_info.windows_build_number), normalized_os_version) as osversion,
        client_info.architecture as arch,
        STRING(DATE(TIMESTAMP(metrics.datetime.crash_time))) as date,
        metrics.string.crash_moz_crash_reason as reason,
        crash_type as type,
        metrics.string.crash_minidump_sha256_hash as minidump_sha256_hash,
        metrics.boolean.crash_startup as startup_crash,
        IFNULL(metrics.string.crash_app_build, client_info.app_build) as build_id,
        signature,
    from moz-fx-data-shared-prod.crash_ping_ingest_external.ingest_output
    join firefox_desktop.desktop_crashes using (document_id, submission_timestamp)
    where
        DATE(submission_timestamp) = @date
    ),
android as
    (select
        IFNULL(metrics.string.crash_app_channel, client_info.app_channel) as channel,
        metrics.string.crash_process_type as process,
        STRING(NULL) as ipc_actor,
        client_info.client_id as clientid,
        document_id as crashid,
        IFNULL(metrics.string.crash_app_display_version, client_info.app_display_version) as version,
        normalized_os as os,
        normalized_os_version as osversion,
        client_info.architecture as arch,
        STRING(DATE(metrics.datetime.crash_time)) as date,
        metrics.string.crash_moz_crash_reason as reason,
        crash_type as type,
        metrics.string.crash_minidump_sha256_hash as minidump_sha256_hash,
        metrics.boolean.crash_startup as startup_crash,
        IFNULL(metrics.string.crash_app_build, client_info.app_build) as build_id,
        signature,
    from moz-fx-data-shared-prod.crash_ping_ingest_external.ingest_output 
    join fenix.crash using (document_id, submission_timestamp)
    where
        DATE(submission_timestamp) = @date
    )

select * from desktop
union all
select * from android
