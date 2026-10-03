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


EFFECT_SCHEMA = {"type": "object", "properties": {"say": {"type": "string"}},
                 "required": ["say"], "additionalProperties": False}


class ExecutedAction(StrictModel):
    kind: Literal["click", "fill"]
    name: str = Field(max_length=200)
    role: str = Field(max_length=40)


class Transition(StrictModel):
    before: str = Field(max_length=300)
    after: str = Field(max_length=300)


class DiffChange(StrictModel):
    role: str = Field(max_length=40)
    name: str = Field(max_length=200)
    what: Literal["disabled", "enabled", "value", "checked", "expanded", "invalid"]
    to: str = Field(default="", max_length=200)


ShortText = Annotated[str, Field(max_length=200)]


class PageDiffModel(StrictModel):
    path: Transition | None = None
    title: Transition | None = None
    added: list[ShortText] = Field(default_factory=list, max_length=8)
    removed: list[ShortText] = Field(default_factory=list, max_length=5)
    changed: list[DiffChange] = Field(default_factory=list, max_length=8)
    alerts: list[ShortText] = Field(default_factory=list, max_length=3)


class EffectRequest(StrictModel):
    action: ExecutedAction
    diff: PageDiffModel


class EffectSummary(StrictModel):
    say: Speech
