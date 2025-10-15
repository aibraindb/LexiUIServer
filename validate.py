from jsonschema import validate, Draft7Validator
import json

def validate_schema(schema):
    validator = Draft7Validator(schema)
    errors = sorted(validator.iter_errors({}), key=lambda e: e.path)
    if errors:
        for err in errors:
            print(f"Schema validation issue: {err.message}")
    else:
        print("✅ Schema format looks valid for Vertex AI.")