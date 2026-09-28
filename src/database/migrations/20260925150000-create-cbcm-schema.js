'use strict';

/** CBCM PostgreSQL baseline migration. Generated from the approved DB diagram. */
module.exports = {
  async up(queryInterface, Sequelize) {

    await queryInterface.createTable('users', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        full_name: { type: Sequelize.STRING },
        email: { type: Sequelize.STRING, unique: true },
        phone: { type: Sequelize.STRING },
        password_hash: { type: Sequelize.STRING },
        role: { type: Sequelize.STRING },
        facility_id: { type: Sequelize.INTEGER },
        highest_qualification: { type: Sequelize.STRING },
        training_status: { type: Sequelize.STRING },
        avatar_url: { type: Sequelize.STRING },
        status: { type: Sequelize.STRING },
        must_change_password: { type: Sequelize.BOOLEAN, defaultValue: true },
        password_changed_at: { type: Sequelize.DATE },
        created_by: { type: Sequelize.INTEGER },
        updated_by: { type: Sequelize.INTEGER },
        created_at: { type: Sequelize.DATE },
        updated_at: { type: Sequelize.DATE },
    });

    await queryInterface.createTable('user_preferences', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: { type: Sequelize.INTEGER, unique: true },
        language: { type: Sequelize.STRING },
        theme: { type: Sequelize.STRING },
        notifications_enabled: { type: Sequelize.BOOLEAN },
        created_at: { type: Sequelize.DATE },
        updated_at: { type: Sequelize.DATE },
    });

    await queryInterface.createTable('user_credentials', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: { type: Sequelize.INTEGER },
        title: { type: Sequelize.STRING },
        icon_url: { type: Sequelize.STRING },
        issued_by: { type: Sequelize.INTEGER },
        issued_at: { type: Sequelize.DATE },
    });

    await queryInterface.createTable('refresh_tokens', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: { type: Sequelize.INTEGER },
        token_hash: { type: Sequelize.STRING },
        device_info: { type: Sequelize.STRING },
        issued_at: { type: Sequelize.DATE },
        expires_at: { type: Sequelize.DATE },
        revoked_at: { type: Sequelize.DATE },
    });

    await queryInterface.createTable('password_reset_tokens', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: { type: Sequelize.INTEGER },
        token_hash: { type: Sequelize.STRING },
        requested_at: { type: Sequelize.DATE },
        expires_at: { type: Sequelize.DATE },
        used_at: { type: Sequelize.DATE },
    });

    await queryInterface.createTable('facilities', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: Sequelize.STRING },
        type: { type: Sequelize.STRING },
        level: { type: Sequelize.STRING },
        region: { type: Sequelize.STRING },
        zone: { type: Sequelize.STRING },
        woreda: { type: Sequelize.STRING },
        kebele: { type: Sequelize.STRING },
        street_address: { type: Sequelize.STRING },
        contact_info: { type: Sequelize.STRING },
        created_by: { type: Sequelize.INTEGER },
        updated_by: { type: Sequelize.INTEGER },
        created_at: { type: Sequelize.DATE },
        updated_at: { type: Sequelize.DATE },
    });

    await queryInterface.createTable('mentorship_cycles', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: Sequelize.STRING },
        status: { type: Sequelize.STRING },
        start_date: { type: Sequelize.DATEONLY },
        end_date: { type: Sequelize.DATEONLY },
        created_by: { type: Sequelize.INTEGER },
        updated_by: { type: Sequelize.INTEGER },
        created_at: { type: Sequelize.DATE },
        updated_at: { type: Sequelize.DATE },
    });

    await queryInterface.createTable('thematic_areas', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        code: { type: Sequelize.STRING },
        name: { type: Sequelize.STRING },
    });

    await queryInterface.createTable('cycle_facilities', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        cycle_id: { type: Sequelize.INTEGER },
        facility_id: { type: Sequelize.INTEGER },
        created_by: { type: Sequelize.INTEGER },
        created_at: { type: Sequelize.DATE },
    });

    await queryInterface.createTable('cycle_thematic_areas', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        cycle_id: { type: Sequelize.INTEGER },
        thematic_area_id: { type: Sequelize.INTEGER },
        created_by: { type: Sequelize.INTEGER },
        created_at: { type: Sequelize.DATE },
    });

    await queryInterface.createTable('assignments', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        mentor_id: { type: Sequelize.INTEGER },
        mentee_id: { type: Sequelize.INTEGER },
        facility_id: { type: Sequelize.INTEGER },
        cycle_id: { type: Sequelize.INTEGER },
        thematic_area_id: { type: Sequelize.INTEGER },
        status: { type: Sequelize.STRING },
        priority_score: { type: Sequelize.FLOAT },
        matching_reason: { type: Sequelize.TEXT },
        assigned_by: { type: Sequelize.INTEGER },
        assigned_at: { type: Sequelize.DATE },
        unassigned_at: { type: Sequelize.DATE },
    });

    await queryInterface.createTable('knowledge_score_snapshots', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        mentee_id: { type: Sequelize.INTEGER },
        facility_id: { type: Sequelize.INTEGER },
        cycle_id: { type: Sequelize.INTEGER },
        thematic_area_id: { type: Sequelize.INTEGER },
        score: { type: Sequelize.FLOAT },
        competency_level: { type: Sequelize.STRING },
        triggered_by: { type: Sequelize.INTEGER },
        recorded_at: { type: Sequelize.DATE },
    });

    await queryInterface.createTable('assessments', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        mentee_id: { type: Sequelize.INTEGER },
        mentor_id: { type: Sequelize.INTEGER },
        facility_id: { type: Sequelize.INTEGER },
        cycle_id: { type: Sequelize.INTEGER },
        thematic_area_id: { type: Sequelize.INTEGER },
        status: { type: Sequelize.STRING },
        aggregate_score: { type: Sequelize.FLOAT },
        feedback: { type: Sequelize.TEXT },
        prerequisites_met: { type: Sequelize.BOOLEAN, defaultValue: false },
        updated_by: { type: Sequelize.INTEGER },
        created_at: { type: Sequelize.DATE },
        updated_at: { type: Sequelize.DATE },
        finalized_at: { type: Sequelize.DATE },
    });

    await queryInterface.createTable('assessment_criteria_scores', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        assessment_id: { type: Sequelize.INTEGER },
        criterion: { type: Sequelize.STRING },
        score: { type: Sequelize.FLOAT },
    });

    await queryInterface.createTable('assessment_checklist_items', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        assessment_id: { type: Sequelize.INTEGER },
        item: { type: Sequelize.STRING },
        checked: { type: Sequelize.BOOLEAN },
    });

    await queryInterface.createTable('assessment_evidence', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        assessment_id: { type: Sequelize.INTEGER },
        title: { type: Sequelize.STRING },
        file_id: { type: Sequelize.INTEGER },
        uploaded_by: { type: Sequelize.INTEGER },
        uploaded_at: { type: Sequelize.DATE },
    });

    await queryInterface.createTable('learning_modules', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        title: { type: Sequelize.STRING },
        thematic_area_id: { type: Sequelize.INTEGER },
        protocol_summary: { type: Sequelize.TEXT },
        created_by: { type: Sequelize.INTEGER },
        updated_by: { type: Sequelize.INTEGER },
        created_at: { type: Sequelize.DATE },
        updated_at: { type: Sequelize.DATE },
    });

    await queryInterface.createTable('learning_module_progress', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        mentee_id: { type: Sequelize.INTEGER },
        module_id: { type: Sequelize.INTEGER },
        status: { type: Sequelize.STRING },
        started_at: { type: Sequelize.DATE },
        completed_at: { type: Sequelize.DATE },
    });

    await queryInterface.createTable('quizzes', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        module_id: { type: Sequelize.INTEGER },
        title: { type: Sequelize.STRING },
        created_by: { type: Sequelize.INTEGER },
        created_at: { type: Sequelize.DATE },
    });

    await queryInterface.createTable('quiz_questions', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        quiz_id: { type: Sequelize.INTEGER },
        prompt: { type: Sequelize.TEXT },
        clinical_context: { type: Sequelize.TEXT },
    });

    await queryInterface.createTable('quiz_question_options', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        question_id: { type: Sequelize.INTEGER },
        text: { type: Sequelize.STRING },
        is_correct: { type: Sequelize.BOOLEAN },
    });

    await queryInterface.createTable('quiz_attempts', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        quiz_id: { type: Sequelize.INTEGER },
        mentee_id: { type: Sequelize.INTEGER },
        score: { type: Sequelize.FLOAT },
        passed: { type: Sequelize.BOOLEAN },
        attempted_at: { type: Sequelize.DATE },
    });

    await queryInterface.createTable('quiz_attempt_answers', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        attempt_id: { type: Sequelize.INTEGER },
        question_id: { type: Sequelize.INTEGER },
        selected_option_id: { type: Sequelize.INTEGER },
        is_correct: { type: Sequelize.BOOLEAN },
    });

    await queryInterface.createTable('clinical_encounters', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        assignment_id: { type: Sequelize.INTEGER },
        mentor_id: { type: Sequelize.INTEGER },
        mentee_id: { type: Sequelize.INTEGER },
        facility_id: { type: Sequelize.INTEGER },
        mode: { type: Sequelize.STRING },
        scheduled_at: { type: Sequelize.DATE },
        started_at: { type: Sequelize.DATE },
        ended_at: { type: Sequelize.DATE },
        clinical_setting: { type: Sequelize.STRING },
        session_goals: { type: Sequelize.TEXT },
        status: { type: Sequelize.STRING },
        cancellation_reason: { type: Sequelize.TEXT },
        recording_file_id: { type: Sequelize.INTEGER },
        updated_by: { type: Sequelize.INTEGER },
        created_at: { type: Sequelize.DATE },
        updated_at: { type: Sequelize.DATE },
    });

    await queryInterface.createTable('encounter_focus_areas', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        encounter_id: { type: Sequelize.INTEGER },
        thematic_area_id: { type: Sequelize.INTEGER },
    });

    await queryInterface.createTable('mentor_notes', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        encounter_id: { type: Sequelize.INTEGER },
        mentor_id: { type: Sequelize.INTEGER },
        note: { type: Sequelize.TEXT },
        created_at: { type: Sequelize.DATE },
    });

    await queryInterface.createTable('logbook_entries', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        mentee_id: { type: Sequelize.INTEGER },
        encounter_id: { type: Sequelize.INTEGER },
        thematic_area_id: { type: Sequelize.INTEGER },
        procedure_type: { type: Sequelize.STRING },
        hours: { type: Sequelize.FLOAT },
        clinical_notes: { type: Sequelize.TEXT },
        status: { type: Sequelize.STRING },
        revision_reason: { type: Sequelize.TEXT },
        outcome: { type: Sequelize.TEXT },
        goal_progress: { type: Sequelize.FLOAT },
        mentor_approval: { type: Sequelize.BOOLEAN, defaultValue: false },
        approved_by: { type: Sequelize.INTEGER },
        approved_at: { type: Sequelize.DATE },
        created_by: { type: Sequelize.INTEGER },
        logged_at: { type: Sequelize.DATE },
        updated_at: { type: Sequelize.DATE },
    });

    await queryInterface.createTable('conversations', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        created_by: { type: Sequelize.INTEGER },
        created_at: { type: Sequelize.DATE },
    });

    await queryInterface.createTable('conversation_participants', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        conversation_id: { type: Sequelize.INTEGER },
        user_id: { type: Sequelize.INTEGER },
    });

    await queryInterface.createTable('messages', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        conversation_id: { type: Sequelize.INTEGER },
        sender_id: { type: Sequelize.INTEGER },
        content: { type: Sequelize.TEXT },
        attachment_file_id: { type: Sequelize.INTEGER },
        sent_at: { type: Sequelize.DATE },
    });

    await queryInterface.createTable('message_reads', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        message_id: { type: Sequelize.INTEGER },
        user_id: { type: Sequelize.INTEGER },
        read_at: { type: Sequelize.DATE },
    });

    await queryInterface.createTable('notifications', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: { type: Sequelize.INTEGER },
        type: { type: Sequelize.STRING },
        title: { type: Sequelize.STRING },
        body: { type: Sequelize.TEXT },
        is_read: { type: Sequelize.BOOLEAN },
        reference_type: { type: Sequelize.STRING },
        reference_id: { type: Sequelize.INTEGER },
        created_at: { type: Sequelize.DATE },
    });

    await queryInterface.createTable('resources', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        title: { type: Sequelize.STRING },
        type: { type: Sequelize.STRING },
        thematic_area_id: { type: Sequelize.INTEGER },
        url: { type: Sequelize.STRING },
        file_id: { type: Sequelize.INTEGER },
        created_by: { type: Sequelize.INTEGER },
        updated_by: { type: Sequelize.INTEGER },
        created_at: { type: Sequelize.DATE },
        updated_at: { type: Sequelize.DATE },
    });

    await queryInterface.createTable('resource_views', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        resource_id: { type: Sequelize.INTEGER },
        user_id: { type: Sequelize.INTEGER },
        viewed_at: { type: Sequelize.DATE },
        completed: { type: Sequelize.BOOLEAN },
    });

    await queryInterface.createTable('starred_resources', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        resource_id: { type: Sequelize.INTEGER },
        user_id: { type: Sequelize.INTEGER },
        starred_at: { type: Sequelize.DATE },
    });

    await queryInterface.createTable('news_posts', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        title: { type: Sequelize.STRING },
        body: { type: Sequelize.TEXT },
        image_file_id: { type: Sequelize.INTEGER },
        target_audience: { type: Sequelize.STRING },
        status: { type: Sequelize.STRING },
        scheduled_at: { type: Sequelize.DATE },
        created_by: { type: Sequelize.INTEGER },
        updated_by: { type: Sequelize.INTEGER },
        created_at: { type: Sequelize.DATE },
        updated_at: { type: Sequelize.DATE },
    });

    await queryInterface.createTable('faqs', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        category: { type: Sequelize.STRING },
        question: { type: Sequelize.TEXT },
        answer: { type: Sequelize.TEXT },
        created_by: { type: Sequelize.INTEGER },
        updated_by: { type: Sequelize.INTEGER },
        created_at: { type: Sequelize.DATE },
        updated_at: { type: Sequelize.DATE },
    });

    await queryInterface.createTable('user_guides', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        title: { type: Sequelize.STRING },
        content: { type: Sequelize.TEXT },
        attachment_file_id: { type: Sequelize.INTEGER },
        target_audience: { type: Sequelize.STRING },
        created_by: { type: Sequelize.INTEGER },
        updated_by: { type: Sequelize.INTEGER },
        created_at: { type: Sequelize.DATE },
        updated_at: { type: Sequelize.DATE },
    });

    await queryInterface.createTable('ai_conversations', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: { type: Sequelize.INTEGER },
        title: { type: Sequelize.STRING },
        created_at: { type: Sequelize.DATE },
        updated_at: { type: Sequelize.DATE },
    });

    await queryInterface.createTable('ai_messages', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        conversation_id: { type: Sequelize.INTEGER },
        role: { type: Sequelize.STRING },
        content: { type: Sequelize.TEXT },
        attachment_file_id: { type: Sequelize.INTEGER },
        created_at: { type: Sequelize.DATE },
    });

    await queryInterface.createTable('ai_message_citations', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        message_id: { type: Sequelize.INTEGER },
        source: { type: Sequelize.STRING },
        excerpt: { type: Sequelize.TEXT },
        url: { type: Sequelize.STRING },
    });

    await queryInterface.createTable('certificate_templates', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        thematic_area_id: { type: Sequelize.INTEGER },
        name: { type: Sequelize.STRING },
        template_file_id: { type: Sequelize.INTEGER },
        created_by: { type: Sequelize.INTEGER },
        created_at: { type: Sequelize.DATE },
    });

    await queryInterface.createTable('certificates', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        mentee_id: { type: Sequelize.INTEGER },
        cycle_id: { type: Sequelize.INTEGER },
        thematic_area_id: { type: Sequelize.INTEGER },
        template_id: { type: Sequelize.INTEGER },
        mentee_name_snapshot: { type: Sequelize.STRING },
        status: { type: Sequelize.STRING },
        pdf_url: { type: Sequelize.STRING },
        issued_by: { type: Sequelize.INTEGER },
        issued_at: { type: Sequelize.DATE },
        version: { type: Sequelize.INTEGER },
    });

    await queryInterface.createTable('activity_logs', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        actor_id: { type: Sequelize.INTEGER },
        facility_id: { type: Sequelize.INTEGER },
        action: { type: Sequelize.STRING },
        entity_type: { type: Sequelize.STRING },
        entity_id: { type: Sequelize.INTEGER },
        details: { type: Sequelize.TEXT },
        before_data: { type: Sequelize.JSONB },
        after_data: { type: Sequelize.JSONB },
        ip_address: { type: Sequelize.STRING },
        user_agent: { type: Sequelize.STRING },
        created_at: { type: Sequelize.DATE },
    });

    await queryInterface.createTable('uploaded_files', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        owner_id: { type: Sequelize.INTEGER },
        context: { type: Sequelize.STRING },
        storage_key: { type: Sequelize.STRING },
        mime_type: { type: Sequelize.STRING },
        size_bytes: { type: Sequelize.BIGINT },
        created_at: { type: Sequelize.DATE },
    });

    await queryInterface.addIndex('users', ["facility_id"], { unique: false, name: 'idx_users_facility_id' });
    await queryInterface.addIndex('users', ["role"], { unique: false, name: 'idx_users_role' });
    await queryInterface.addIndex('users', ["status"], { unique: false, name: 'idx_users_status' });
    await queryInterface.addIndex('user_preferences', ["user_id"], { unique: true, name: 'idx_user_preferences_user_id_unique' });
    await queryInterface.addIndex('refresh_tokens', ["user_id"], { unique: false, name: 'idx_refresh_tokens_user_id' });
    await queryInterface.addIndex('refresh_tokens', ["expires_at"], { unique: false, name: 'idx_refresh_tokens_expires_at' });
    await queryInterface.addIndex('password_reset_tokens', ["user_id"], { unique: false, name: 'idx_password_reset_tokens_user_id' });
    await queryInterface.addIndex('password_reset_tokens', ["expires_at"], { unique: false, name: 'idx_password_reset_tokens_expires_at' });
    await queryInterface.addIndex('facilities', ["region"], { unique: false, name: 'idx_facilities_region' });
    await queryInterface.addIndex('facilities', ["zone"], { unique: false, name: 'idx_facilities_zone' });
    await queryInterface.addIndex('facilities', ["woreda"], { unique: false, name: 'idx_facilities_woreda' });
    await queryInterface.addIndex('facilities', ["type"], { unique: false, name: 'idx_facilities_type' });
    await queryInterface.addIndex('facilities', ["level"], { unique: false, name: 'idx_facilities_level' });
    await queryInterface.addIndex('mentorship_cycles', ["status"], { unique: false, name: 'idx_mentorship_cycles_status' });
    await queryInterface.addIndex('mentorship_cycles', ["start_date"], { unique: false, name: 'idx_mentorship_cycles_start_date' });
    await queryInterface.addIndex('mentorship_cycles', ["end_date"], { unique: false, name: 'idx_mentorship_cycles_end_date' });
    await queryInterface.addIndex('thematic_areas', ["code"], { unique: true, name: 'idx_thematic_areas_code_unique' });
    await queryInterface.addIndex('cycle_facilities', ["cycle_id", "facility_id"], { unique: true, name: 'idx_cycle_facilities_cycle_id_facility_id_unique' });
    await queryInterface.addIndex('cycle_thematic_areas', ["cycle_id", "thematic_area_id"], { unique: true, name: 'idx_cycle_thematic_areas_cycle_id_thematic_area_id_unique' });
    await queryInterface.addIndex('cycle_thematic_areas', ["thematic_area_id"], { unique: false, name: 'idx_cycle_thematic_areas_thematic_area_id' });
    await queryInterface.addIndex('assignments', ["mentor_id"], { unique: false, name: 'idx_assignments_mentor_id' });
    await queryInterface.addIndex('assignments', ["mentee_id"], { unique: false, name: 'idx_assignments_mentee_id' });
    await queryInterface.addIndex('assignments', ["facility_id"], { unique: false, name: 'idx_assignments_facility_id' });
    await queryInterface.addIndex('assignments', ["cycle_id"], { unique: false, name: 'idx_assignments_cycle_id' });
    await queryInterface.addIndex('assignments', ["thematic_area_id"], { unique: false, name: 'idx_assignments_thematic_area_id' });
    await queryInterface.addIndex('assignments', ["status"], { unique: false, name: 'idx_assignments_status' });
    await queryInterface.addIndex('knowledge_score_snapshots', ["mentee_id"], { unique: false, name: 'idx_knowledge_score_snapshots_mentee_id' });
    await queryInterface.addIndex('knowledge_score_snapshots', ["facility_id"], { unique: false, name: 'idx_knowledge_score_snapshots_facility_id' });
    await queryInterface.addIndex('knowledge_score_snapshots', ["cycle_id"], { unique: false, name: 'idx_knowledge_score_snapshots_cycle_id' });
    await queryInterface.addIndex('knowledge_score_snapshots', ["thematic_area_id"], { unique: false, name: 'idx_knowledge_score_snapshots_thematic_area_id' });
    await queryInterface.addIndex('knowledge_score_snapshots', ["recorded_at"], { unique: false, name: 'idx_knowledge_score_snapshots_recorded_at' });
    await queryInterface.addIndex('assessments', ["mentee_id"], { unique: false, name: 'idx_assessments_mentee_id' });
    await queryInterface.addIndex('assessments', ["mentor_id"], { unique: false, name: 'idx_assessments_mentor_id' });
    await queryInterface.addIndex('assessments', ["facility_id"], { unique: false, name: 'idx_assessments_facility_id' });
    await queryInterface.addIndex('assessments', ["cycle_id"], { unique: false, name: 'idx_assessments_cycle_id' });
    await queryInterface.addIndex('assessments', ["thematic_area_id"], { unique: false, name: 'idx_assessments_thematic_area_id' });
    await queryInterface.addIndex('assessments', ["status"], { unique: false, name: 'idx_assessments_status' });
    await queryInterface.addIndex('assessment_criteria_scores', ["assessment_id"], { unique: false, name: 'idx_assessment_criteria_scores_assessment_id' });
    await queryInterface.addIndex('assessment_checklist_items', ["assessment_id"], { unique: false, name: 'idx_assessment_checklist_items_assessment_id' });
    await queryInterface.addIndex('assessment_evidence', ["assessment_id"], { unique: false, name: 'idx_assessment_evidence_assessment_id' });
    await queryInterface.addIndex('assessment_evidence', ["file_id"], { unique: false, name: 'idx_assessment_evidence_file_id' });
    await queryInterface.addIndex('learning_modules', ["thematic_area_id"], { unique: false, name: 'idx_learning_modules_thematic_area_id' });
    await queryInterface.addIndex('learning_module_progress', ["mentee_id", "module_id"], { unique: true, name: 'idx_learning_module_progress_mentee_id_module_id_unique' });
    await queryInterface.addIndex('learning_module_progress', ["module_id"], { unique: false, name: 'idx_learning_module_progress_module_id' });
    await queryInterface.addIndex('learning_module_progress', ["status"], { unique: false, name: 'idx_learning_module_progress_status' });
    await queryInterface.addIndex('quizzes', ["module_id"], { unique: false, name: 'idx_quizzes_module_id' });
    await queryInterface.addIndex('quiz_questions', ["quiz_id"], { unique: false, name: 'idx_quiz_questions_quiz_id' });
    await queryInterface.addIndex('quiz_question_options', ["question_id"], { unique: false, name: 'idx_quiz_question_options_question_id' });
    await queryInterface.addIndex('quiz_attempts', ["quiz_id"], { unique: false, name: 'idx_quiz_attempts_quiz_id' });
    await queryInterface.addIndex('quiz_attempts', ["mentee_id"], { unique: false, name: 'idx_quiz_attempts_mentee_id' });
    await queryInterface.addIndex('quiz_attempts', ["attempted_at"], { unique: false, name: 'idx_quiz_attempts_attempted_at' });
    await queryInterface.addIndex('quiz_attempt_answers', ["attempt_id", "question_id"], { unique: true, name: 'idx_quiz_attempt_answers_attempt_id_question_id_unique' });
    await queryInterface.addIndex('quiz_attempt_answers', ["question_id"], { unique: false, name: 'idx_quiz_attempt_answers_question_id' });
    await queryInterface.addIndex('quiz_attempt_answers', ["selected_option_id"], { unique: false, name: 'idx_quiz_attempt_answers_selected_option_id' });
    await queryInterface.addIndex('clinical_encounters', ["assignment_id"], { unique: false, name: 'idx_clinical_encounters_assignment_id' });
    await queryInterface.addIndex('clinical_encounters', ["mentor_id"], { unique: false, name: 'idx_clinical_encounters_mentor_id' });
    await queryInterface.addIndex('clinical_encounters', ["mentee_id"], { unique: false, name: 'idx_clinical_encounters_mentee_id' });
    await queryInterface.addIndex('clinical_encounters', ["facility_id"], { unique: false, name: 'idx_clinical_encounters_facility_id' });
    await queryInterface.addIndex('clinical_encounters', ["scheduled_at"], { unique: false, name: 'idx_clinical_encounters_scheduled_at' });
    await queryInterface.addIndex('clinical_encounters', ["status"], { unique: false, name: 'idx_clinical_encounters_status' });
    await queryInterface.addIndex('encounter_focus_areas', ["encounter_id", "thematic_area_id"], { unique: false, name: 'idx_encounter_focus_areas_encounter_id_thematic_area_id' });
    await queryInterface.addIndex('encounter_focus_areas', ["thematic_area_id"], { unique: false, name: 'idx_encounter_focus_areas_thematic_area_id' });
    await queryInterface.addIndex('mentor_notes', ["encounter_id"], { unique: false, name: 'idx_mentor_notes_encounter_id' });
    await queryInterface.addIndex('mentor_notes', ["mentor_id"], { unique: false, name: 'idx_mentor_notes_mentor_id' });
    await queryInterface.addIndex('logbook_entries', ["mentee_id"], { unique: false, name: 'idx_logbook_entries_mentee_id' });
    await queryInterface.addIndex('logbook_entries', ["encounter_id"], { unique: false, name: 'idx_logbook_entries_encounter_id' });
    await queryInterface.addIndex('logbook_entries', ["thematic_area_id"], { unique: false, name: 'idx_logbook_entries_thematic_area_id' });
    await queryInterface.addIndex('logbook_entries', ["status"], { unique: false, name: 'idx_logbook_entries_status' });
    await queryInterface.addIndex('logbook_entries', ["logged_at"], { unique: false, name: 'idx_logbook_entries_logged_at' });
    await queryInterface.addIndex('conversation_participants', ["conversation_id", "user_id"], { unique: true, name: 'idx_conversation_participants_conversation_id_user_id_unique' });
    await queryInterface.addIndex('conversation_participants', ["user_id"], { unique: false, name: 'idx_conversation_participants_user_id' });
    await queryInterface.addIndex('messages', ["conversation_id"], { unique: false, name: 'idx_messages_conversation_id' });
    await queryInterface.addIndex('messages', ["sender_id"], { unique: false, name: 'idx_messages_sender_id' });
    await queryInterface.addIndex('messages', ["sent_at"], { unique: false, name: 'idx_messages_sent_at' });
    await queryInterface.addIndex('message_reads', ["message_id", "user_id"], { unique: false, name: 'idx_message_reads_message_id_user_id' });
    await queryInterface.addIndex('message_reads', ["user_id"], { unique: false, name: 'idx_message_reads_user_id' });
    await queryInterface.addIndex('notifications', ["user_id"], { unique: false, name: 'idx_notifications_user_id' });
    await queryInterface.addIndex('notifications', ["is_read"], { unique: false, name: 'idx_notifications_is_read' });
    await queryInterface.addIndex('notifications', ["created_at"], { unique: false, name: 'idx_notifications_created_at' });
    await queryInterface.addIndex('resources', ["thematic_area_id"], { unique: false, name: 'idx_resources_thematic_area_id' });
    await queryInterface.addIndex('resources', ["type"], { unique: false, name: 'idx_resources_type' });
    await queryInterface.addIndex('resource_views', ["resource_id"], { unique: false, name: 'idx_resource_views_resource_id' });
    await queryInterface.addIndex('resource_views', ["user_id"], { unique: false, name: 'idx_resource_views_user_id' });
    await queryInterface.addIndex('resource_views', ["viewed_at"], { unique: false, name: 'idx_resource_views_viewed_at' });
    await queryInterface.addIndex('starred_resources', ["resource_id", "user_id"], { unique: true, name: 'idx_starred_resources_resource_id_user_id_unique' });
    await queryInterface.addIndex('starred_resources', ["user_id"], { unique: false, name: 'idx_starred_resources_user_id' });
    await queryInterface.addIndex('news_posts', ["status"], { unique: false, name: 'idx_news_posts_status' });
    await queryInterface.addIndex('news_posts', ["scheduled_at"], { unique: false, name: 'idx_news_posts_scheduled_at' });
    await queryInterface.addIndex('faqs', ["category"], { unique: false, name: 'idx_faqs_category' });
    await queryInterface.addIndex('user_guides', ["target_audience"], { unique: false, name: 'idx_user_guides_target_audience' });
    await queryInterface.addIndex('ai_conversations', ["user_id"], { unique: false, name: 'idx_ai_conversations_user_id' });
    await queryInterface.addIndex('ai_conversations', ["updated_at"], { unique: false, name: 'idx_ai_conversations_updated_at' });
    await queryInterface.addIndex('ai_messages', ["conversation_id"], { unique: false, name: 'idx_ai_messages_conversation_id' });
    await queryInterface.addIndex('ai_messages', ["created_at"], { unique: false, name: 'idx_ai_messages_created_at' });
    await queryInterface.addIndex('ai_message_citations', ["message_id"], { unique: false, name: 'idx_ai_message_citations_message_id' });
    await queryInterface.addIndex('certificate_templates', ["thematic_area_id"], { unique: false, name: 'idx_certificate_templates_thematic_area_id' });
    await queryInterface.addIndex('certificates', ["mentee_id"], { unique: false, name: 'idx_certificates_mentee_id' });
    await queryInterface.addIndex('certificates', ["cycle_id"], { unique: false, name: 'idx_certificates_cycle_id' });
    await queryInterface.addIndex('certificates', ["thematic_area_id"], { unique: false, name: 'idx_certificates_thematic_area_id' });
    await queryInterface.addIndex('certificates', ["status"], { unique: false, name: 'idx_certificates_status' });
    await queryInterface.addIndex('activity_logs', ["actor_id"], { unique: false, name: 'idx_activity_logs_actor_id' });
    await queryInterface.addIndex('activity_logs', ["facility_id"], { unique: false, name: 'idx_activity_logs_facility_id' });
    await queryInterface.addIndex('activity_logs', ["entity_type"], { unique: false, name: 'idx_activity_logs_entity_type' });
    await queryInterface.addIndex('activity_logs', ["entity_id"], { unique: false, name: 'idx_activity_logs_entity_id' });
    await queryInterface.addIndex('activity_logs', ["created_at"], { unique: false, name: 'idx_activity_logs_created_at' });
    await queryInterface.addIndex('uploaded_files', ["owner_id"], { unique: false, name: 'idx_uploaded_files_owner_id' });
    await queryInterface.addIndex('uploaded_files', ["context"], { unique: false, name: 'idx_uploaded_files_context' });
    await queryInterface.addIndex('uploaded_files', ["created_at"], { unique: false, name: 'idx_uploaded_files_created_at' });

    await queryInterface.addConstraint('users', { fields: ['facility_id'], type: 'foreign key', name: 'fk_users_facility_id_facilities', references: { table: 'facilities', field: 'id' } });
    await queryInterface.addConstraint('users', { fields: ['created_by'], type: 'foreign key', name: 'fk_users_created_by_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('users', { fields: ['updated_by'], type: 'foreign key', name: 'fk_users_updated_by_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('user_preferences', { fields: ['user_id'], type: 'foreign key', name: 'fk_user_preferences_user_id_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('user_credentials', { fields: ['user_id'], type: 'foreign key', name: 'fk_user_credentials_user_id_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('user_credentials', { fields: ['issued_by'], type: 'foreign key', name: 'fk_user_credentials_issued_by_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('refresh_tokens', { fields: ['user_id'], type: 'foreign key', name: 'fk_refresh_tokens_user_id_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('password_reset_tokens', { fields: ['user_id'], type: 'foreign key', name: 'fk_password_reset_tokens_user_id_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('cycle_facilities', { fields: ['cycle_id'], type: 'foreign key', name: 'fk_cycle_facilities_cycle_id_mentorship_cycles', references: { table: 'mentorship_cycles', field: 'id' } });
    await queryInterface.addConstraint('cycle_facilities', { fields: ['facility_id'], type: 'foreign key', name: 'fk_cycle_facilities_facility_id_facilities', references: { table: 'facilities', field: 'id' } });
    await queryInterface.addConstraint('cycle_facilities', { fields: ['created_by'], type: 'foreign key', name: 'fk_cycle_facilities_created_by_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('cycle_thematic_areas', { fields: ['cycle_id'], type: 'foreign key', name: 'fk_cycle_thematic_areas_cycle_id_mentorship_cycles', references: { table: 'mentorship_cycles', field: 'id' } });
    await queryInterface.addConstraint('cycle_thematic_areas', { fields: ['thematic_area_id'], type: 'foreign key', name: 'fk_cycle_thematic_areas_thematic_area_id_thematic_areas', references: { table: 'thematic_areas', field: 'id' } });
    await queryInterface.addConstraint('cycle_thematic_areas', { fields: ['created_by'], type: 'foreign key', name: 'fk_cycle_thematic_areas_created_by_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('facilities', { fields: ['created_by'], type: 'foreign key', name: 'fk_facilities_created_by_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('facilities', { fields: ['updated_by'], type: 'foreign key', name: 'fk_facilities_updated_by_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('mentorship_cycles', { fields: ['created_by'], type: 'foreign key', name: 'fk_mentorship_cycles_created_by_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('mentorship_cycles', { fields: ['updated_by'], type: 'foreign key', name: 'fk_mentorship_cycles_updated_by_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('assignments', { fields: ['mentor_id'], type: 'foreign key', name: 'fk_assignments_mentor_id_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('assignments', { fields: ['mentee_id'], type: 'foreign key', name: 'fk_assignments_mentee_id_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('assignments', { fields: ['facility_id'], type: 'foreign key', name: 'fk_assignments_facility_id_facilities', references: { table: 'facilities', field: 'id' } });
    await queryInterface.addConstraint('assignments', { fields: ['cycle_id'], type: 'foreign key', name: 'fk_assignments_cycle_id_mentorship_cycles', references: { table: 'mentorship_cycles', field: 'id' } });
    await queryInterface.addConstraint('assignments', { fields: ['thematic_area_id'], type: 'foreign key', name: 'fk_assignments_thematic_area_id_thematic_areas', references: { table: 'thematic_areas', field: 'id' } });
    await queryInterface.addConstraint('assignments', { fields: ['assigned_by'], type: 'foreign key', name: 'fk_assignments_assigned_by_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('knowledge_score_snapshots', { fields: ['mentee_id'], type: 'foreign key', name: 'fk_knowledge_score_snapshots_mentee_id_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('knowledge_score_snapshots', { fields: ['facility_id'], type: 'foreign key', name: 'fk_knowledge_score_snapshots_facility_id_facilities', references: { table: 'facilities', field: 'id' } });
    await queryInterface.addConstraint('knowledge_score_snapshots', { fields: ['cycle_id'], type: 'foreign key', name: 'fk_knowledge_score_snapshots_cycle_id_mentorship_cycles', references: { table: 'mentorship_cycles', field: 'id' } });
    await queryInterface.addConstraint('knowledge_score_snapshots', { fields: ['thematic_area_id'], type: 'foreign key', name: 'fk_knowledge_score_snapshots_thematic_area_id_thematic_areas', references: { table: 'thematic_areas', field: 'id' } });
    await queryInterface.addConstraint('knowledge_score_snapshots', { fields: ['triggered_by'], type: 'foreign key', name: 'fk_knowledge_score_snapshots_triggered_by_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('assessments', { fields: ['mentee_id'], type: 'foreign key', name: 'fk_assessments_mentee_id_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('assessments', { fields: ['mentor_id'], type: 'foreign key', name: 'fk_assessments_mentor_id_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('assessments', { fields: ['facility_id'], type: 'foreign key', name: 'fk_assessments_facility_id_facilities', references: { table: 'facilities', field: 'id' } });
    await queryInterface.addConstraint('assessments', { fields: ['cycle_id'], type: 'foreign key', name: 'fk_assessments_cycle_id_mentorship_cycles', references: { table: 'mentorship_cycles', field: 'id' } });
    await queryInterface.addConstraint('assessments', { fields: ['thematic_area_id'], type: 'foreign key', name: 'fk_assessments_thematic_area_id_thematic_areas', references: { table: 'thematic_areas', field: 'id' } });
    await queryInterface.addConstraint('assessments', { fields: ['updated_by'], type: 'foreign key', name: 'fk_assessments_updated_by_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('assessment_criteria_scores', { fields: ['assessment_id'], type: 'foreign key', name: 'fk_assessment_criteria_scores_assessment_id_assessments', references: { table: 'assessments', field: 'id' } });
    await queryInterface.addConstraint('assessment_checklist_items', { fields: ['assessment_id'], type: 'foreign key', name: 'fk_assessment_checklist_items_assessment_id_assessments', references: { table: 'assessments', field: 'id' } });
    await queryInterface.addConstraint('assessment_evidence', { fields: ['assessment_id'], type: 'foreign key', name: 'fk_assessment_evidence_assessment_id_assessments', references: { table: 'assessments', field: 'id' } });
    await queryInterface.addConstraint('assessment_evidence', { fields: ['file_id'], type: 'foreign key', name: 'fk_assessment_evidence_file_id_uploaded_files', references: { table: 'uploaded_files', field: 'id' } });
    await queryInterface.addConstraint('assessment_evidence', { fields: ['uploaded_by'], type: 'foreign key', name: 'fk_assessment_evidence_uploaded_by_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('learning_modules', { fields: ['thematic_area_id'], type: 'foreign key', name: 'fk_learning_modules_thematic_area_id_thematic_areas', references: { table: 'thematic_areas', field: 'id' } });
    await queryInterface.addConstraint('learning_modules', { fields: ['created_by'], type: 'foreign key', name: 'fk_learning_modules_created_by_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('learning_modules', { fields: ['updated_by'], type: 'foreign key', name: 'fk_learning_modules_updated_by_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('learning_module_progress', { fields: ['mentee_id'], type: 'foreign key', name: 'fk_learning_module_progress_mentee_id_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('learning_module_progress', { fields: ['module_id'], type: 'foreign key', name: 'fk_learning_module_progress_module_id_learning_modules', references: { table: 'learning_modules', field: 'id' } });
    await queryInterface.addConstraint('quizzes', { fields: ['module_id'], type: 'foreign key', name: 'fk_quizzes_module_id_learning_modules', references: { table: 'learning_modules', field: 'id' } });
    await queryInterface.addConstraint('quizzes', { fields: ['created_by'], type: 'foreign key', name: 'fk_quizzes_created_by_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('quiz_questions', { fields: ['quiz_id'], type: 'foreign key', name: 'fk_quiz_questions_quiz_id_quizzes', references: { table: 'quizzes', field: 'id' } });
    await queryInterface.addConstraint('quiz_question_options', { fields: ['question_id'], type: 'foreign key', name: 'fk_quiz_question_options_question_id_quiz_questions', references: { table: 'quiz_questions', field: 'id' } });
    await queryInterface.addConstraint('quiz_attempts', { fields: ['quiz_id'], type: 'foreign key', name: 'fk_quiz_attempts_quiz_id_quizzes', references: { table: 'quizzes', field: 'id' } });
    await queryInterface.addConstraint('quiz_attempts', { fields: ['mentee_id'], type: 'foreign key', name: 'fk_quiz_attempts_mentee_id_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('quiz_attempt_answers', { fields: ['attempt_id'], type: 'foreign key', name: 'fk_quiz_attempt_answers_attempt_id_quiz_attempts', references: { table: 'quiz_attempts', field: 'id' } });
    await queryInterface.addConstraint('quiz_attempt_answers', { fields: ['question_id'], type: 'foreign key', name: 'fk_quiz_attempt_answers_question_id_quiz_questions', references: { table: 'quiz_questions', field: 'id' } });
    await queryInterface.addConstraint('quiz_attempt_answers', { fields: ['selected_option_id'], type: 'foreign key', name: 'fk_quiz_attempt_answers_selected_option_id_quiz_question_options', references: { table: 'quiz_question_options', field: 'id' } });
    await queryInterface.addConstraint('clinical_encounters', { fields: ['assignment_id'], type: 'foreign key', name: 'fk_clinical_encounters_assignment_id_assignments', references: { table: 'assignments', field: 'id' } });
    await queryInterface.addConstraint('clinical_encounters', { fields: ['mentor_id'], type: 'foreign key', name: 'fk_clinical_encounters_mentor_id_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('clinical_encounters', { fields: ['mentee_id'], type: 'foreign key', name: 'fk_clinical_encounters_mentee_id_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('clinical_encounters', { fields: ['facility_id'], type: 'foreign key', name: 'fk_clinical_encounters_facility_id_facilities', references: { table: 'facilities', field: 'id' } });
    await queryInterface.addConstraint('clinical_encounters', { fields: ['recording_file_id'], type: 'foreign key', name: 'fk_clinical_encounters_recording_file_id_uploaded_files', references: { table: 'uploaded_files', field: 'id' } });
    await queryInterface.addConstraint('clinical_encounters', { fields: ['updated_by'], type: 'foreign key', name: 'fk_clinical_encounters_updated_by_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('encounter_focus_areas', { fields: ['encounter_id'], type: 'foreign key', name: 'fk_encounter_focus_areas_encounter_id_clinical_encounters', references: { table: 'clinical_encounters', field: 'id' } });
    await queryInterface.addConstraint('encounter_focus_areas', { fields: ['thematic_area_id'], type: 'foreign key', name: 'fk_encounter_focus_areas_thematic_area_id_thematic_areas', references: { table: 'thematic_areas', field: 'id' } });
    await queryInterface.addConstraint('mentor_notes', { fields: ['encounter_id'], type: 'foreign key', name: 'fk_mentor_notes_encounter_id_clinical_encounters', references: { table: 'clinical_encounters', field: 'id' } });
    await queryInterface.addConstraint('mentor_notes', { fields: ['mentor_id'], type: 'foreign key', name: 'fk_mentor_notes_mentor_id_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('logbook_entries', { fields: ['mentee_id'], type: 'foreign key', name: 'fk_logbook_entries_mentee_id_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('logbook_entries', { fields: ['encounter_id'], type: 'foreign key', name: 'fk_logbook_entries_encounter_id_clinical_encounters', references: { table: 'clinical_encounters', field: 'id' } });
    await queryInterface.addConstraint('logbook_entries', { fields: ['thematic_area_id'], type: 'foreign key', name: 'fk_logbook_entries_thematic_area_id_thematic_areas', references: { table: 'thematic_areas', field: 'id' } });
    await queryInterface.addConstraint('logbook_entries', { fields: ['created_by'], type: 'foreign key', name: 'fk_logbook_entries_created_by_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('logbook_entries', { fields: ['approved_by'], type: 'foreign key', name: 'fk_logbook_entries_approved_by_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('conversations', { fields: ['created_by'], type: 'foreign key', name: 'fk_conversations_created_by_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('conversation_participants', { fields: ['conversation_id'], type: 'foreign key', name: 'fk_conversation_participants_conversation_id_conversations', references: { table: 'conversations', field: 'id' } });
    await queryInterface.addConstraint('conversation_participants', { fields: ['user_id'], type: 'foreign key', name: 'fk_conversation_participants_user_id_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('messages', { fields: ['conversation_id'], type: 'foreign key', name: 'fk_messages_conversation_id_conversations', references: { table: 'conversations', field: 'id' } });
    await queryInterface.addConstraint('messages', { fields: ['sender_id'], type: 'foreign key', name: 'fk_messages_sender_id_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('messages', { fields: ['attachment_file_id'], type: 'foreign key', name: 'fk_messages_attachment_file_id_uploaded_files', references: { table: 'uploaded_files', field: 'id' } });
    await queryInterface.addConstraint('message_reads', { fields: ['message_id'], type: 'foreign key', name: 'fk_message_reads_message_id_messages', references: { table: 'messages', field: 'id' } });
    await queryInterface.addConstraint('message_reads', { fields: ['user_id'], type: 'foreign key', name: 'fk_message_reads_user_id_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('notifications', { fields: ['user_id'], type: 'foreign key', name: 'fk_notifications_user_id_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('resources', { fields: ['thematic_area_id'], type: 'foreign key', name: 'fk_resources_thematic_area_id_thematic_areas', references: { table: 'thematic_areas', field: 'id' } });
    await queryInterface.addConstraint('resources', { fields: ['file_id'], type: 'foreign key', name: 'fk_resources_file_id_uploaded_files', references: { table: 'uploaded_files', field: 'id' } });
    await queryInterface.addConstraint('resources', { fields: ['created_by'], type: 'foreign key', name: 'fk_resources_created_by_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('resources', { fields: ['updated_by'], type: 'foreign key', name: 'fk_resources_updated_by_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('resource_views', { fields: ['resource_id'], type: 'foreign key', name: 'fk_resource_views_resource_id_resources', references: { table: 'resources', field: 'id' } });
    await queryInterface.addConstraint('resource_views', { fields: ['user_id'], type: 'foreign key', name: 'fk_resource_views_user_id_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('starred_resources', { fields: ['resource_id'], type: 'foreign key', name: 'fk_starred_resources_resource_id_resources', references: { table: 'resources', field: 'id' } });
    await queryInterface.addConstraint('starred_resources', { fields: ['user_id'], type: 'foreign key', name: 'fk_starred_resources_user_id_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('news_posts', { fields: ['image_file_id'], type: 'foreign key', name: 'fk_news_posts_image_file_id_uploaded_files', references: { table: 'uploaded_files', field: 'id' } });
    await queryInterface.addConstraint('news_posts', { fields: ['created_by'], type: 'foreign key', name: 'fk_news_posts_created_by_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('news_posts', { fields: ['updated_by'], type: 'foreign key', name: 'fk_news_posts_updated_by_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('faqs', { fields: ['created_by'], type: 'foreign key', name: 'fk_faqs_created_by_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('faqs', { fields: ['updated_by'], type: 'foreign key', name: 'fk_faqs_updated_by_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('user_guides', { fields: ['attachment_file_id'], type: 'foreign key', name: 'fk_user_guides_attachment_file_id_uploaded_files', references: { table: 'uploaded_files', field: 'id' } });
    await queryInterface.addConstraint('user_guides', { fields: ['created_by'], type: 'foreign key', name: 'fk_user_guides_created_by_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('user_guides', { fields: ['updated_by'], type: 'foreign key', name: 'fk_user_guides_updated_by_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('ai_conversations', { fields: ['user_id'], type: 'foreign key', name: 'fk_ai_conversations_user_id_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('ai_messages', { fields: ['conversation_id'], type: 'foreign key', name: 'fk_ai_messages_conversation_id_ai_conversations', references: { table: 'ai_conversations', field: 'id' } });
    await queryInterface.addConstraint('ai_messages', { fields: ['attachment_file_id'], type: 'foreign key', name: 'fk_ai_messages_attachment_file_id_uploaded_files', references: { table: 'uploaded_files', field: 'id' } });
    await queryInterface.addConstraint('ai_message_citations', { fields: ['message_id'], type: 'foreign key', name: 'fk_ai_message_citations_message_id_ai_messages', references: { table: 'ai_messages', field: 'id' } });
    await queryInterface.addConstraint('certificate_templates', { fields: ['thematic_area_id'], type: 'foreign key', name: 'fk_certificate_templates_thematic_area_id_thematic_areas', references: { table: 'thematic_areas', field: 'id' } });
    await queryInterface.addConstraint('certificate_templates', { fields: ['template_file_id'], type: 'foreign key', name: 'fk_certificate_templates_template_file_id_uploaded_files', references: { table: 'uploaded_files', field: 'id' } });
    await queryInterface.addConstraint('certificate_templates', { fields: ['created_by'], type: 'foreign key', name: 'fk_certificate_templates_created_by_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('certificates', { fields: ['mentee_id'], type: 'foreign key', name: 'fk_certificates_mentee_id_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('certificates', { fields: ['cycle_id'], type: 'foreign key', name: 'fk_certificates_cycle_id_mentorship_cycles', references: { table: 'mentorship_cycles', field: 'id' } });
    await queryInterface.addConstraint('certificates', { fields: ['thematic_area_id'], type: 'foreign key', name: 'fk_certificates_thematic_area_id_thematic_areas', references: { table: 'thematic_areas', field: 'id' } });
    await queryInterface.addConstraint('certificates', { fields: ['template_id'], type: 'foreign key', name: 'fk_certificates_template_id_certificate_templates', references: { table: 'certificate_templates', field: 'id' } });
    await queryInterface.addConstraint('certificates', { fields: ['issued_by'], type: 'foreign key', name: 'fk_certificates_issued_by_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('activity_logs', { fields: ['actor_id'], type: 'foreign key', name: 'fk_activity_logs_actor_id_users', references: { table: 'users', field: 'id' } });
    await queryInterface.addConstraint('activity_logs', { fields: ['facility_id'], type: 'foreign key', name: 'fk_activity_logs_facility_id_facilities', references: { table: 'facilities', field: 'id' } });
    await queryInterface.addConstraint('uploaded_files', { fields: ['owner_id'], type: 'foreign key', name: 'fk_uploaded_files_owner_id_users', references: { table: 'users', field: 'id' } });
  },

  async down(queryInterface) {

    await queryInterface.removeConstraint('uploaded_files', 'fk_uploaded_files_owner_id_users');
    await queryInterface.removeConstraint('activity_logs', 'fk_activity_logs_facility_id_facilities');
    await queryInterface.removeConstraint('activity_logs', 'fk_activity_logs_actor_id_users');
    await queryInterface.removeConstraint('certificates', 'fk_certificates_issued_by_users');
    await queryInterface.removeConstraint('certificates', 'fk_certificates_template_id_certificate_templates');
    await queryInterface.removeConstraint('certificates', 'fk_certificates_thematic_area_id_thematic_areas');
    await queryInterface.removeConstraint('certificates', 'fk_certificates_cycle_id_mentorship_cycles');
    await queryInterface.removeConstraint('certificates', 'fk_certificates_mentee_id_users');
    await queryInterface.removeConstraint('certificate_templates', 'fk_certificate_templates_created_by_users');
    await queryInterface.removeConstraint('certificate_templates', 'fk_certificate_templates_template_file_id_uploaded_files');
    await queryInterface.removeConstraint('certificate_templates', 'fk_certificate_templates_thematic_area_id_thematic_areas');
    await queryInterface.removeConstraint('ai_message_citations', 'fk_ai_message_citations_message_id_ai_messages');
    await queryInterface.removeConstraint('ai_messages', 'fk_ai_messages_attachment_file_id_uploaded_files');
    await queryInterface.removeConstraint('ai_messages', 'fk_ai_messages_conversation_id_ai_conversations');
    await queryInterface.removeConstraint('ai_conversations', 'fk_ai_conversations_user_id_users');
    await queryInterface.removeConstraint('user_guides', 'fk_user_guides_updated_by_users');
    await queryInterface.removeConstraint('user_guides', 'fk_user_guides_created_by_users');
    await queryInterface.removeConstraint('user_guides', 'fk_user_guides_attachment_file_id_uploaded_files');
    await queryInterface.removeConstraint('faqs', 'fk_faqs_updated_by_users');
    await queryInterface.removeConstraint('faqs', 'fk_faqs_created_by_users');
    await queryInterface.removeConstraint('news_posts', 'fk_news_posts_updated_by_users');
    await queryInterface.removeConstraint('news_posts', 'fk_news_posts_created_by_users');
    await queryInterface.removeConstraint('news_posts', 'fk_news_posts_image_file_id_uploaded_files');
    await queryInterface.removeConstraint('starred_resources', 'fk_starred_resources_user_id_users');
    await queryInterface.removeConstraint('starred_resources', 'fk_starred_resources_resource_id_resources');
    await queryInterface.removeConstraint('resource_views', 'fk_resource_views_user_id_users');
    await queryInterface.removeConstraint('resource_views', 'fk_resource_views_resource_id_resources');
    await queryInterface.removeConstraint('resources', 'fk_resources_updated_by_users');
    await queryInterface.removeConstraint('resources', 'fk_resources_created_by_users');
    await queryInterface.removeConstraint('resources', 'fk_resources_file_id_uploaded_files');
    await queryInterface.removeConstraint('resources', 'fk_resources_thematic_area_id_thematic_areas');
    await queryInterface.removeConstraint('notifications', 'fk_notifications_user_id_users');
    await queryInterface.removeConstraint('message_reads', 'fk_message_reads_user_id_users');
    await queryInterface.removeConstraint('message_reads', 'fk_message_reads_message_id_messages');
    await queryInterface.removeConstraint('messages', 'fk_messages_attachment_file_id_uploaded_files');
    await queryInterface.removeConstraint('messages', 'fk_messages_sender_id_users');
    await queryInterface.removeConstraint('messages', 'fk_messages_conversation_id_conversations');
    await queryInterface.removeConstraint('conversation_participants', 'fk_conversation_participants_user_id_users');
    await queryInterface.removeConstraint('conversation_participants', 'fk_conversation_participants_conversation_id_conversations');
    await queryInterface.removeConstraint('conversations', 'fk_conversations_created_by_users');
    await queryInterface.removeConstraint('logbook_entries', 'fk_logbook_entries_approved_by_users');
    await queryInterface.removeConstraint('logbook_entries', 'fk_logbook_entries_created_by_users');
    await queryInterface.removeConstraint('logbook_entries', 'fk_logbook_entries_thematic_area_id_thematic_areas');
    await queryInterface.removeConstraint('logbook_entries', 'fk_logbook_entries_encounter_id_clinical_encounters');
    await queryInterface.removeConstraint('logbook_entries', 'fk_logbook_entries_mentee_id_users');
    await queryInterface.removeConstraint('mentor_notes', 'fk_mentor_notes_mentor_id_users');
    await queryInterface.removeConstraint('mentor_notes', 'fk_mentor_notes_encounter_id_clinical_encounters');
    await queryInterface.removeConstraint('encounter_focus_areas', 'fk_encounter_focus_areas_thematic_area_id_thematic_areas');
    await queryInterface.removeConstraint('encounter_focus_areas', 'fk_encounter_focus_areas_encounter_id_clinical_encounters');
    await queryInterface.removeConstraint('clinical_encounters', 'fk_clinical_encounters_updated_by_users');
    await queryInterface.removeConstraint('clinical_encounters', 'fk_clinical_encounters_recording_file_id_uploaded_files');
    await queryInterface.removeConstraint('clinical_encounters', 'fk_clinical_encounters_facility_id_facilities');
    await queryInterface.removeConstraint('clinical_encounters', 'fk_clinical_encounters_mentee_id_users');
    await queryInterface.removeConstraint('clinical_encounters', 'fk_clinical_encounters_mentor_id_users');
    await queryInterface.removeConstraint('clinical_encounters', 'fk_clinical_encounters_assignment_id_assignments');
    await queryInterface.removeConstraint('quiz_attempt_answers', 'fk_quiz_attempt_answers_selected_option_id_quiz_question_options');
    await queryInterface.removeConstraint('quiz_attempt_answers', 'fk_quiz_attempt_answers_question_id_quiz_questions');
    await queryInterface.removeConstraint('quiz_attempt_answers', 'fk_quiz_attempt_answers_attempt_id_quiz_attempts');
    await queryInterface.removeConstraint('quiz_attempts', 'fk_quiz_attempts_mentee_id_users');
    await queryInterface.removeConstraint('quiz_attempts', 'fk_quiz_attempts_quiz_id_quizzes');
    await queryInterface.removeConstraint('quiz_question_options', 'fk_quiz_question_options_question_id_quiz_questions');
    await queryInterface.removeConstraint('quiz_questions', 'fk_quiz_questions_quiz_id_quizzes');
    await queryInterface.removeConstraint('quizzes', 'fk_quizzes_created_by_users');
    await queryInterface.removeConstraint('quizzes', 'fk_quizzes_module_id_learning_modules');
    await queryInterface.removeConstraint('learning_module_progress', 'fk_learning_module_progress_module_id_learning_modules');
    await queryInterface.removeConstraint('learning_module_progress', 'fk_learning_module_progress_mentee_id_users');
    await queryInterface.removeConstraint('learning_modules', 'fk_learning_modules_updated_by_users');
    await queryInterface.removeConstraint('learning_modules', 'fk_learning_modules_created_by_users');
    await queryInterface.removeConstraint('learning_modules', 'fk_learning_modules_thematic_area_id_thematic_areas');
    await queryInterface.removeConstraint('assessment_evidence', 'fk_assessment_evidence_uploaded_by_users');
    await queryInterface.removeConstraint('assessment_evidence', 'fk_assessment_evidence_file_id_uploaded_files');
    await queryInterface.removeConstraint('assessment_evidence', 'fk_assessment_evidence_assessment_id_assessments');
    await queryInterface.removeConstraint('assessment_checklist_items', 'fk_assessment_checklist_items_assessment_id_assessments');
    await queryInterface.removeConstraint('assessment_criteria_scores', 'fk_assessment_criteria_scores_assessment_id_assessments');
    await queryInterface.removeConstraint('assessments', 'fk_assessments_updated_by_users');
    await queryInterface.removeConstraint('assessments', 'fk_assessments_thematic_area_id_thematic_areas');
    await queryInterface.removeConstraint('assessments', 'fk_assessments_cycle_id_mentorship_cycles');
    await queryInterface.removeConstraint('assessments', 'fk_assessments_facility_id_facilities');
    await queryInterface.removeConstraint('assessments', 'fk_assessments_mentor_id_users');
    await queryInterface.removeConstraint('assessments', 'fk_assessments_mentee_id_users');
    await queryInterface.removeConstraint('knowledge_score_snapshots', 'fk_knowledge_score_snapshots_triggered_by_users');
    await queryInterface.removeConstraint('knowledge_score_snapshots', 'fk_knowledge_score_snapshots_thematic_area_id_thematic_areas');
    await queryInterface.removeConstraint('knowledge_score_snapshots', 'fk_knowledge_score_snapshots_cycle_id_mentorship_cycles');
    await queryInterface.removeConstraint('knowledge_score_snapshots', 'fk_knowledge_score_snapshots_facility_id_facilities');
    await queryInterface.removeConstraint('knowledge_score_snapshots', 'fk_knowledge_score_snapshots_mentee_id_users');
    await queryInterface.removeConstraint('assignments', 'fk_assignments_assigned_by_users');
    await queryInterface.removeConstraint('assignments', 'fk_assignments_thematic_area_id_thematic_areas');
    await queryInterface.removeConstraint('assignments', 'fk_assignments_cycle_id_mentorship_cycles');
    await queryInterface.removeConstraint('assignments', 'fk_assignments_facility_id_facilities');
    await queryInterface.removeConstraint('assignments', 'fk_assignments_mentee_id_users');
    await queryInterface.removeConstraint('assignments', 'fk_assignments_mentor_id_users');
    await queryInterface.removeConstraint('mentorship_cycles', 'fk_mentorship_cycles_updated_by_users');
    await queryInterface.removeConstraint('mentorship_cycles', 'fk_mentorship_cycles_created_by_users');
    await queryInterface.removeConstraint('facilities', 'fk_facilities_updated_by_users');
    await queryInterface.removeConstraint('facilities', 'fk_facilities_created_by_users');
    await queryInterface.removeConstraint('cycle_thematic_areas', 'fk_cycle_thematic_areas_created_by_users');
    await queryInterface.removeConstraint('cycle_thematic_areas', 'fk_cycle_thematic_areas_thematic_area_id_thematic_areas');
    await queryInterface.removeConstraint('cycle_thematic_areas', 'fk_cycle_thematic_areas_cycle_id_mentorship_cycles');
    await queryInterface.removeConstraint('cycle_facilities', 'fk_cycle_facilities_created_by_users');
    await queryInterface.removeConstraint('cycle_facilities', 'fk_cycle_facilities_facility_id_facilities');
    await queryInterface.removeConstraint('cycle_facilities', 'fk_cycle_facilities_cycle_id_mentorship_cycles');
    await queryInterface.removeConstraint('password_reset_tokens', 'fk_password_reset_tokens_user_id_users');
    await queryInterface.removeConstraint('refresh_tokens', 'fk_refresh_tokens_user_id_users');
    await queryInterface.removeConstraint('user_credentials', 'fk_user_credentials_issued_by_users');
    await queryInterface.removeConstraint('user_credentials', 'fk_user_credentials_user_id_users');
    await queryInterface.removeConstraint('user_preferences', 'fk_user_preferences_user_id_users');
    await queryInterface.removeConstraint('users', 'fk_users_updated_by_users');
    await queryInterface.removeConstraint('users', 'fk_users_created_by_users');
    await queryInterface.removeConstraint('users', 'fk_users_facility_id_facilities');
    await queryInterface.dropTable('uploaded_files');
    await queryInterface.dropTable('activity_logs');
    await queryInterface.dropTable('certificates');
    await queryInterface.dropTable('certificate_templates');
    await queryInterface.dropTable('ai_message_citations');
    await queryInterface.dropTable('ai_messages');
    await queryInterface.dropTable('ai_conversations');
    await queryInterface.dropTable('user_guides');
    await queryInterface.dropTable('faqs');
    await queryInterface.dropTable('news_posts');
    await queryInterface.dropTable('starred_resources');
    await queryInterface.dropTable('resource_views');
    await queryInterface.dropTable('resources');
    await queryInterface.dropTable('notifications');
    await queryInterface.dropTable('message_reads');
    await queryInterface.dropTable('messages');
    await queryInterface.dropTable('conversation_participants');
    await queryInterface.dropTable('conversations');
    await queryInterface.dropTable('logbook_entries');
    await queryInterface.dropTable('mentor_notes');
    await queryInterface.dropTable('encounter_focus_areas');
    await queryInterface.dropTable('clinical_encounters');
    await queryInterface.dropTable('quiz_attempt_answers');
    await queryInterface.dropTable('quiz_attempts');
    await queryInterface.dropTable('quiz_question_options');
    await queryInterface.dropTable('quiz_questions');
    await queryInterface.dropTable('quizzes');
    await queryInterface.dropTable('learning_module_progress');
    await queryInterface.dropTable('learning_modules');
    await queryInterface.dropTable('assessment_evidence');
    await queryInterface.dropTable('assessment_checklist_items');
    await queryInterface.dropTable('assessment_criteria_scores');
    await queryInterface.dropTable('assessments');
    await queryInterface.dropTable('knowledge_score_snapshots');
    await queryInterface.dropTable('assignments');
    await queryInterface.dropTable('cycle_thematic_areas');
    await queryInterface.dropTable('cycle_facilities');
    await queryInterface.dropTable('thematic_areas');
    await queryInterface.dropTable('mentorship_cycles');
    await queryInterface.dropTable('facilities');
    await queryInterface.dropTable('password_reset_tokens');
    await queryInterface.dropTable('refresh_tokens');
    await queryInterface.dropTable('user_credentials');
    await queryInterface.dropTable('user_preferences');
    await queryInterface.dropTable('users');
  },
};
