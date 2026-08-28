"""Validate authored demo content only; this does not run the UI or MoneyAI."""

import argparse
import copy
import json
import math
import re
import sys
from datetime import date, datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CHECKS = 0


def require(condition, message):
    global CHECKS
    CHECKS += 1
    if not condition:
        raise ValueError(message)


def unique_objects(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=unique_objects)


def by_id(items):
    indexed = {item["id"]: item for item in items}
    require(len(indexed) == len(items), "Duplicate item ID")
    return indexed


def walk(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def apply_patches(document, patches):
    """Apply the add/replace subset used in the acceptance fixtures."""
    result = copy.deepcopy(document)
    for patch in patches:
        require(patch["op"] in {"add", "replace"}, "Unsupported fixture patch")
        require(patch["path"].startswith("/"), "JSON Pointer must be absolute")
        parts = [part.replace("~1", "/").replace("~0", "~") for part in patch["path"].split("/")[1:]]
        parent = result
        for part in parts[:-1]:
            parent = parent[int(part)] if isinstance(parent, list) else parent[part]
        key = parts[-1]
        value = copy.deepcopy(patch["value"])
        if isinstance(parent, list):
            if key == "-":
                require(patch["op"] == "add", "Append requires add")
                parent.append(value)
            else:
                index = int(key)
                require(0 <= index < len(parent), "Fixture list index out of bounds")
                if patch["op"] == "replace":
                    parent[index] = value
                else:
                    parent.insert(index, value)
        else:
            require(patch["op"] == "add" or key in parent, f"Missing patch path: {patch['path']}")
            parent[key] = value
    return result


def first_request(demo):
    """Only current input enters the model; reference answers stay out."""
    allowed_sources = set()
    for obj in walk(demo["initial_snapshot"]):
        allowed_sources.update(obj.get("source_ids", []))
        if "source_id" in obj:
            allowed_sources.add(obj["source_id"])
    return {
        "case_id": demo["case_id"],
        "input_kind": demo["provenance"]["input_kind"],
        "label": "虚构演示输入；不含参考答案或未来反馈",
        "merchant": copy.deepcopy(demo["merchant"]),
        "product": copy.deepcopy(demo["product"]),
        "initial_snapshot": copy.deepcopy(demo["initial_snapshot"]),
        "sources": [copy.deepcopy(source) for source in demo["sources"] if source["id"] in allowed_sources],
    }


def validate_content(demo=None, acceptance=None):
    demo = read_json(ROOT / "fixtures/underbed-storage.demo.json") if demo is None else demo
    acceptance = read_json(ROOT / "fixtures/acceptance.scenarios.json") if acceptance is None else acceptance
    provenance = demo["provenance"]
    require(provenance["input_kind"] == "synthetic", "Case must remain synthetic")
    require(provenance["analysis_kind"] == "authored_reference", "Reference answers must be labelled")
    require(not provenance["moneyai_verified"] and not provenance["business_effect_verified"],
            "Content checks cannot claim model or business validation")
    require("虚构" in provenance["label"], "Missing visible synthetic label")
    date.fromisoformat(provenance["created_on"])

    sources = by_id(demo["sources"])
    require(all({"id", "kind", "label", "scope"} <= source.keys() for source in sources.values()),
            "Each source needs a type, label and inspection scope")
    snapshot = demo["initial_snapshot"]
    facts = by_id(snapshot["facts"])
    facts_by_key = {fact["key"]: fact for fact in facts.values()}
    require(len(facts_by_key) == len(facts), "Duplicate fact key")
    constraints = by_id(snapshot["constraints"])
    inquiries = by_id(snapshot["inquiries"])
    for fact in facts.values():
        require(fact["confirmation"] in {"confirmed_in_fixture", "unknown"}, "Invalid base confirmation")
        if fact["confirmation"] == "unknown":
            require(fact["value"] is None, "Unknown base facts must remain null")
        else:
            require(fact["value"] is not None and bool(fact["source_ids"]), "Confirmed facts need evidence")
    for key in ("price", "units_per_order", "external_length", "external_width", "external_height"):
        require(facts_by_key[key]["value"] > 0, f"Invalid positive fact: {key}")
    require(isinstance(facts_by_key["units_per_order"]["value"], int), "Pieces must be integer")
    for metric in snapshot["metrics"]:
        value = metric["value"]
        require(value is None or (isinstance(value, int) and not isinstance(value, bool) and value >= 0),
                "Base metrics must be nonnegative integers or null")
        require(date.fromisoformat(metric["period_start"]) <= date.fromisoformat(metric["period_end"]),
                "Metric time window reversed")
        require(metric["object_id"] == demo["product"]["id"], "Metric belongs to wrong product")

    for obj in walk(demo):
        if "source_id" in obj:
            require(obj["source_id"] in sources, "Unknown source_id")
        for source_id in obj.get("source_ids", []):
            require(source_id in sources, f"Unknown source: {source_id}")
        for fact_id in obj.get("fact_ids", []):
            require(fact_id in facts, f"Unknown fact: {fact_id}")
        for inquiry_id in obj.get("inquiry_ids", []):
            require(inquiry_id in inquiries, f"Unknown first-round inquiry: {inquiry_id}")

    first = demo["round_1_reference"]
    second = demo["round_2_reference"]
    require(first["input_snapshot_id"] == snapshot["id"], "First round uses wrong snapshot")
    for obj in walk(first):
        require("S6" not in obj.get("source_ids", []) and "S7" not in obj.get("source_ids", []),
                "Future execution/follow-up leaked into first-round evidence")
    initial_request = first_request(demo)
    require({source["id"] for source in initial_request["sources"]} == {"S1", "S2", "S3", "S4", "S5"},
            "Initial request includes future sources or misses input evidence")
    require(not ({"round_1_reference", "round_2_reference", "feedback_event", "round_2_request"}
                 & initial_request.keys()), "Reference answers or future feedback leaked into request")

    feedback = demo["feedback_event"]
    require(feedback["merchant_id"] == demo["merchant"]["id"], "Feedback merchant mismatch")
    require(feedback["product_id"] == demo["product"]["id"], "Feedback product mismatch")
    require(feedback["round_id"] == first["id"], "Feedback round mismatch")
    require(feedback["persistence"]["status"] == "not_run", "Authored event is not a saved event")
    require(feedback["persistence"]["provider"] == "none", "No live storage provider was tested")
    require(feedback["adoption_status"] == "adopted" and feedback["execution_status"] == "completed",
            "Main route requires a clearly declared simulated completed action")
    datetime.fromisoformat(feedback["executed_at"])
    artifacts = by_id(first["artifacts"])
    require(set(feedback["executed_artifact_ids"]) == set(artifacts), "Completed artifacts mismatch")
    require(first["selection"]["adoption_status"] == "undecided", "Selection must not imply adoption")
    require(first["selection"]["execution_status"] == "not_started", "Selection must not imply execution")

    active_constraints = {constraint["key"]: constraint["value"] for constraint in constraints.values()}
    for index, round_data in enumerate((first, second)):
        if index == 1:
            for update in feedback["new_constraints"]:
                require(update["supersedes"] in constraints, "Unknown superseded constraint")
                require(update["key"] == constraints[update["supersedes"]]["key"], "Constraint key mismatch")
                active_constraints[update["key"]] = update["value"]
        require(len(round_data["priority_issues"]) == 1, "Main route must have one priority issue")
        plans = by_id(round_data["plans"])
        require(len(plans) == 2, "Main route needs two real choices")
        require(sum(bool(plan["recommended"]) for plan in plans.values()) == 1, "Need one recommendation")
        require(len({plan["action_kind"] for plan in plans.values()}) == 2, "Choices must differ in action")
        for plan in plans.values():
            require(0 <= plan["estimated_minutes"] <= active_constraints["time_budget_minutes"],
                    "Plan exceeds declared time budget")
            require(plan["estimated_extra_cost_cny"] >= 0 and math.isfinite(plan["estimated_extra_cost_cny"]),
                    "Invalid cost")
            require(not plan["requires_discount"] and not plan["requires_new_ad_spend"]
                    and not plan["requires_photography"], "Plan violates hard demo restrictions")
            for capability in plan["required_capabilities"]:
                require(active_constraints.get(capability) is True, f"Unavailable capability: {capability}")
        require(all(artifact["plan_id"] in plans for artifact in
                    (round_data.get("artifacts", []) + round_data.get("alternative_artifacts", [])
                     + ([round_data["artifact"]] if "artifact" in round_data else []))),
                "Artifact refers to an unknown plan")
    require(feedback["selected_plan_id"] == first["selection"]["plan_id"], "Selected plan mismatch")
    require(second["history_used"]["feedback_event_id"] == feedback["id"], "Second round uses wrong feedback")
    require(len(second["history_used"]["fact_ids"]) >= 3, "Memory demo needs at least three facts")
    require(second["history_used"]["completed_artifact_ids"] == feedback["executed_artifact_ids"],
            "Second round misstates execution")

    unchanged = second["unchanged_facts"]
    require(unchanged["price_cny"] == facts_by_key["price"]["value"], "Remembered price drift")
    require(unchanged["units_per_order"] == facts_by_key["units_per_order"]["value"], "Remembered quantity drift")
    dimensions = [facts_by_key[key]["value"] for key in ("external_length", "external_width", "external_height")]
    require(unchanged["external_dimensions_cm"] == dimensions, "Remembered dimension drift")
    dimension_text = "×".join(str(value) for value in dimensions) + "cm"
    require(dimension_text in artifacts["ART-1"]["text"] and dimension_text in second["artifact"]["text"],
            "Copy dimensions drift from confirmed facts")
    require(f'{facts_by_key["price"]["value"]:.2f}元' in artifacts["ART-2"]["text"], "Copy price drift")

    request = demo["round_2_request"]
    require(request["must_load_history"] is True, "Memory test must read stored history")
    require(not ({"facts", "feedback_event", "initial_snapshot", "constraints"} & request.keys()),
            "Second request must not resend historical facts")
    require(request["new_observation"]["product_detail_visitors"] is None, "Unknown denominator lost")
    require(request["new_observation"]["comparison_ready"] is False, "Main case is not directly comparable")
    require(request["merchant_id"] == feedback["merchant_id"] and request["product_id"] == feedback["product_id"],
            "Second-round context mismatch")

    require(acceptance["base_fixture"] == "underbed-storage.demo.json", "Wrong acceptance base")
    cases = by_id(acceptance["scenarios"])
    require(set(cases) == {f"T{index:02}" for index in range(1, 16)}, "Missing acceptance scenario")
    require(acceptance["status"] == "not_run", "Scenario definitions are not passed tests")
    allowed_levels = {"content", "ui", "model", "memory", "authorization"}
    for case in cases.values():
        require(case["status"] == "not_run" and bool(case["steps"]) and bool(case["expected"]),
                "Scenario needs unexecuted status, steps and expectations")
        require(set(case["levels"]) <= allowed_levels, "Unknown verification layer")
        apply_patches(demo, case["patches"])
        for variant in case.get("variants", []):
            apply_patches(demo, case["patches"] + variant["patches"])
        if "held_out_variant" in case:
            variant = case["held_out_variant"]
            apply_patches(demo, variant["patches"])
            require(variant["must_regenerate_first_round"] and variant["must_not_use_authored_answers"],
                    "Held-out memory check cannot reuse authored answers")
    require(len(demo["memory_counterfactuals"]) >= 2, "Need a memory counterfactual")

    document_paths = [ROOT / "README.md", ROOT / "PROGRESS.md", ROOT / "AGENTS.md"]
    document_paths.extend(sorted((ROOT / "docs").rglob("*.md")))
    for file_path in document_paths:
        relative = file_path.relative_to(ROOT)
        text = file_path.read_text(encoding="utf-8")
        require("\ufffd" not in text, f"Unicode replacement character in {relative}")
        for target in re.findall(r"\[[^\]]+\]\(([^)]+)\)", text):
            if target.startswith(("https://", "http://", "mailto:", "#")):
                continue
            destination = target.split("#", 1)[0]
            require(not re.match(r"^(?:[A-Za-z]:|[/\\])", destination),
                    f"Use a portable relative link in {relative}: {target}")
            resolved = (file_path.parent / destination).resolve()
            require(resolved == ROOT.resolve() or ROOT.resolve() in resolved.parents,
                    f"Link leaves repository in {relative}: {target}")
            require(resolved.exists(), f"Broken link in {relative}: {target}")
    return len(cases)


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request", choices=("round1", "round2"), help="Print input-only JSON after validation")
    arguments = parser.parse_args()
    try:
        scenario_count = validate_content()
    except (ValueError, KeyError, IndexError, TypeError, OSError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        sys.exit(1)
    if arguments.request:
        content = read_json(ROOT / "fixtures/underbed-storage.demo.json")
        payload = first_request(content) if arguments.request == "round1" else content["round_2_request"]
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print(f"PASS: {CHECKS} content checks; {scenario_count} acceptance definitions have valid fixture paths.")
        print("NOT RUN: UI, model, MoneyAI memory, authorization and business-effect tests.")
