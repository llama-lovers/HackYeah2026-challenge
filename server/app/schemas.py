"""Provider schemas stay flat; local validation applies stricter limits."""

from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StrictBool

ACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "action": {"type": "string", "enum": ["click", "fill", "none"]},
        "target": {"type": "string"},
        "text": {"type": "string"},
        "needs_confirmation": {"type": "boolean"},
        "say": {"type": "string"},
    },
    "required": ["action", "target", "text", "needs_confirmation", "say"],
    "additionalProperties": False,
}


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


Speech = Annotated[str, AfterValidator(lambda value: value[:300])]


class ActionRequest(StrictModel):
    utterance: str = Field(min_length=1, max_length=500)
    snapshot: str = Field(min_length=1, max_length=60000)


class ActionProposal(StrictModel):
    action: Literal["click", "fill", "none"]
    target: str = Field(max_length=32)
    text: str = Field(max_length=500)
    needs_confirmation: StrictBool
    say: Speech
