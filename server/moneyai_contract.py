"""Strict, bounded Luya <-> MoneyAI request contract.

The browser can describe business data, but it cannot select a MoneyAI workspace,
session, provider URL, model, or credentials.  Those stay in server configuration.
"""
from __future__ import annotations

import hashlib
import json
import math
import re


CONTRACT_VERSION = "luya.moneyai.v1"
MAX_SAFE_VERSION = (1 << 53) - 1
MAX_CANONICAL_BYTES = 240 * 1024
TOKEN = re.compile(r"[A-Za-z0-9._:-]{1,120}")
FINGERPRINT = re.compile(r"sha256:[0-9a-f]{64}")
NON_TEXT = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\ud800-\udfff]")

ENVELOPE_FIELDS = {
    "contractVersion", "operation", "operationId", "attemptId", "scope", "consent", "payload"
}
SCOPE_FIELDS = {
    "sessionId", "roundId", "inputVersion", "analysisId", "pathId", "artifact", "feedback",
    "inputFingerprint",
}
CONSENT_FIELDS = {"granted", "sendScope", "dataClasses"}
ARTIFACT_FIELDS = {"id", "version"}
FEEDBACK_FIELDS = {"id", "recordVersion", "detailsVersion"}
OPERATIONS = {"intake.extract", "analysis.run", "decision.write", "history.read"}
INTAKE_FIELDS = {"version", "transcript", "description", "sources", "materials"}
MATERIAL_FIELDS = {"materialId", "materialVersion", "mime", "text"}
ANALYSIS_FIELDS = {"version", "focus", "facts", "constraints", "unknowns"}
DECISION_FIELDS = {"version", "record"}
HISTORY_FIELDS = {"version", "query"}
HISTORY_QUERY_FIELDS = {"limit", "cursor", "recordIds", "operationIds", "roundIds"}
TEXT_MIMES = {"text/plain", "text/csv", "application/json"}


class ContractError(ValueError):
    pass


def _exact_fields(value, fields, label):
    if not isinstance(value, dict) or set(value) != fields:
        raise ContractError(f"{label}_fields")


def _token(value, label, *, nullable=False):
    if nullable and value is None:
        return
    if not isinstance(value, str) or TOKEN.fullmatch(value) is None:
        raise ContractError(label)


def _version(value, label):
    if type(value) is not int or not 0 < value <= MAX_SAFE_VERSION:
        raise ContractError(label)


def _text(value, limit, label):
    if not isinstance(value, str) or len(value) > limit or NON_TEXT.search(value):
        raise ContractError(label)


def _json_safe(value, *, depth=0, budget=None):
    """Reject executable/coercible values and bound nested DTOs."""
    if depth > 8:
        raise ContractError("payload_depth")
    if value is None or isinstance(value, (str, bool)):
        if isinstance(value, str):
            _text(value, 50_000, "payload_text")
        return
    if type(value) is int:
        if abs(value) > MAX_SAFE_VERSION:
            raise ContractError("payload_number")
        return
    if type(value) is float:
        if not math.isfinite(value) or abs(value) > MAX_SAFE_VERSION:
            raise ContractError("payload_number")
        return
    if isinstance(value, list):
        if len(value) > 100:
            raise ContractError("payload_array")
        for item in value:
            _json_safe(item, depth=depth + 1, budget=budget)
        return
    if isinstance(value, dict):
        if len(value) > 100:
            raise ContractError("payload_object")
        for key, item in value.items():
            _text(key, 80, "payload_key")
            _json_safe(item, depth=depth + 1, budget=budget)
        return
    raise ContractError("payload_type")


def _token_list(value, label, *, maximum=16):
    if (
        not isinstance(value, list)
        or not 0 < len(value) <= maximum
        or len(set(value)) != len(value)
    ):
        raise ContractError(label)
    for item in value:
        _token(item, label)


def _validate_scope(scope, operation):
    _exact_fields(scope, SCOPE_FIELDS, "scope")
    _token(scope["sessionId"], "session_id")
    _token(scope["roundId"], "round_id")
    _version(scope["inputVersion"], "input_version")
    _token(scope["analysisId"], "analysis_id", nullable=True)
    _token(scope["pathId"], "path_id", nullable=True)
    if FINGERPRINT.fullmatch(scope["inputFingerprint"] or "") is None:
        raise ContractError("input_fingerprint")
    artifact = scope["artifact"]
    if artifact is not None:
        _exact_fields(artifact, ARTIFACT_FIELDS, "artifact")
        _token(artifact["id"], "artifact_id")
        _version(artifact["version"], "artifact_version")
    feedback = scope["feedback"]
    if feedback is not None:
        _exact_fields(feedback, FEEDBACK_FIELDS, "feedback")
        _token(feedback["id"], "feedback_id")
        _version(feedback["recordVersion"], "feedback_record_version")
        if type(feedback["detailsVersion"]) is not int or not 0 <= feedback["detailsVersion"] <= MAX_SAFE_VERSION:
            raise ContractError("feedback_details_version")
    if operation == "decision.write" and (scope["analysisId"] is None or scope["pathId"] is None):
        raise ContractError("decision_scope")


def _validate_consent(consent):
    _exact_fields(consent, CONSENT_FIELDS, "consent")
    if consent["granted"] is not True:
        raise ContractError("consent_required")
    _token_list(consent["sendScope"], "send_scope")
    _token_list(consent["dataClasses"], "data_classes")


def _validate_intake(payload):
    _exact_fields(payload, INTAKE_FIELDS, "intake")
    if payload["version"] != "intake.extract.v1":
        raise ContractError("intake_version")
    _text(payload["transcript"], 20_000, "transcript")
    _text(payload["description"], 20_000, "description")
    sources = payload["sources"]
    if (
        not isinstance(sources, list)
        or len(sources) > 20
        or any(not isinstance(source, str) or TOKEN.fullmatch(source) is None for source in sources)
    ):
        raise ContractError("sources")
    materials = payload["materials"]
    if not isinstance(materials, list) or len(materials) > 6:
        raise ContractError("materials")
    seen = set()
    for material in materials:
        _exact_fields(material, MATERIAL_FIELDS, "material")
        _token(material["materialId"], "material_id")
        if material["materialId"] in seen:
            raise ContractError("material_duplicate")
        seen.add(material["materialId"])
        _version(material["materialVersion"], "material_version")
        if material["mime"] not in TEXT_MIMES:
            raise ContractError("material_mime")
        _text(material["text"], 50_000, "material_text")


def _validate_analysis(payload):
    _exact_fields(payload, ANALYSIS_FIELDS, "analysis")
    if payload["version"] != "analysis.request.v1":
        raise ContractError("analysis_version")
    _text(payload["focus"], 2_000, "analysis_focus")
    for key, maximum in (("facts", 100), ("constraints", 50), ("unknowns", 50)):
        items = payload[key]
        if not isinstance(items, list) or len(items) > maximum or any(not isinstance(item, dict) for item in items):
            raise ContractError("analysis_" + key)
        _json_safe(items)


def _validate_decision(payload):
    _exact_fields(payload, DECISION_FIELDS, "decision")
    if payload["version"] != "decision.record.v1" or not isinstance(payload["record"], dict):
        raise ContractError("decision_payload")
    _json_safe(payload["record"])


def _validate_history(payload):
    _exact_fields(payload, HISTORY_FIELDS, "history")
    if payload["version"] != "history.query.v1" or not isinstance(payload["query"], dict):
        raise ContractError("history_payload")
    query = payload["query"]
    if not {"limit", "cursor"}.issubset(query) or not set(query).issubset(HISTORY_QUERY_FIELDS):
        raise ContractError("history_query_fields")
    limit = query.get("limit", 20)
    if type(limit) is not int or not 0 < limit <= 100:
        raise ContractError("history_limit")
    cursor = query.get("cursor")
    if cursor is not None:
        _text(cursor, 500, "history_cursor")
    for key in ("recordIds", "operationIds", "roundIds"):
        values = query.get(key, [])
        if not isinstance(values, list) or len(values) > 100:
            raise ContractError("history_" + key)
        for value in values:
            _token(value, "history_" + key)


def validate_envelope(value, expected_operation=None):
    _exact_fields(value, ENVELOPE_FIELDS, "envelope")
    if value["contractVersion"] != CONTRACT_VERSION:
        raise ContractError("contract_version")
    operation = value["operation"]
    if operation not in OPERATIONS or (expected_operation is not None and operation != expected_operation):
        raise ContractError("operation")
    _token(value["operationId"], "operation_id")
    _token(value["attemptId"], "attempt_id")
    _validate_scope(value["scope"], operation)
    _validate_consent(value["consent"])
    validators = {
        "intake.extract": _validate_intake,
        "analysis.run": _validate_analysis,
        "decision.write": _validate_decision,
        "history.read": _validate_history,
    }
    validators[operation](value["payload"])
    _json_safe(value)
    if len(canonical_json(value).encode("utf-8")) > MAX_CANONICAL_BYTES:
        raise ContractError("request_too_large")
    return value


def canonical_json(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def logical_request_hash(envelope):
    logical = {key: value for key, value in envelope.items() if key != "attemptId"}
    return "sha256:" + hashlib.sha256(canonical_json(logical).encode("utf-8")).hexdigest()


def response_identity(envelope):
    return {
        "contractVersion": CONTRACT_VERSION,
        "operation": envelope["operation"],
        "operationId": envelope["operationId"],
        "attemptId": envelope["attemptId"],
        "scope": envelope["scope"],
    }
