import asyncio
import json
import httpx
import pytest
from config import Settings
from remote_engine import OpenRouterEngine, API_URL


def test_verified_remote_protocol_without_paid_call():
    async def run():
        cfg=Settings(backend="openrouter",openrouter_api_key="test-placeholder",openrouter_model="test-model",openrouter_voice="test-voice")
        engine=OpenRouterEngine(cfg)
        await engine.start()
        await engine.client.aclose()
        def handler(request):
            assert str(request.url)==API_URL
            body=json.loads(request.content)
            assert body==dict(model="test-model",voice="test-voice",input="Test",response_format="mp3")
            return httpx.Response(200,content=b"protocol-test",headers={"content-type":"audio/mpeg"})
        engine.client=httpx.AsyncClient(transport=httpx.MockTransport(handler))
        assert b"".join([x async for x in engine.synthesize_stream("Test")])==b"protocol-test"
        await engine.close()
    asyncio.run(run())


def test_remote_requires_explicit_configuration():
    with pytest.raises(RuntimeError,match="TTS_OPENROUTER"):
        asyncio.run(OpenRouterEngine(Settings(backend="openrouter")).start())
