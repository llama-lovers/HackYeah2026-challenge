import pytest
from config import Settings
from backends import engine_class


def test_defaults_and_env_precedence(tmp_path, monkeypatch):
    file = tmp_path / "config.env"
    file.write_text("TTS_LENGTH_SCALE=0.8\nTTS_NORMALIZE_TEXT=true\n")
    monkeypatch.setenv("TTS_LENGTH_SCALE", "1.0")
    cfg = Settings.from_env(file)
    assert cfg.parameters == dict(length_scale=1.0, noise_scale=0.85, noise_w_scale=1.0, volume=1.0)
    assert cfg.normalize_text
    assert cfg.local_voice == "pl_PL-mc_speech-medium"


@pytest.mark.parametrize("kwargs", [{"length_scale":0}, {"noise_scale":float("nan")}, {"port":0}, {"backend":"invalid"}, {"local_voice":"../escape"}])
def test_invalid(kwargs):
    with pytest.raises(ValueError): Settings(**kwargs)


def test_remote_explicitly_unconfigured():
    with pytest.raises(ValueError, match="extension point"): engine_class("remote")


def test_secret_not_in_repr():
    assert "test-secret" not in repr(Settings(openrouter_api_key="test-secret"))
