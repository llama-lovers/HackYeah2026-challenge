import asyncio
from pathlib import Path
import pytest
from config import Settings
from local_engine import LocalEngine


def test_real_piper_reuse_and_chunks():
    cfg = Settings()
    if not cfg.model_path.exists(): pytest.skip("Download voice to run real Piper test")
    async def exercise():
        engine = LocalEngine(cfg)
        await engine.start()
        original = engine.voice
        await engine.start()
        assert engine.load_count == 1 and engine.voice is original
        assert engine.sample_rate == 22050
        assert {k:getattr(engine.syn_config,k) for k in cfg.parameters} == cfg.parameters
        chunks = [x async for x in engine.synthesize_stream("Dzień dobry. W czym mogę pomóc?")]
        assert len(chunks) >= 2 and all(len(x)>0 and len(x)%2==0 for x in chunks)
        stream = engine.synthesize_stream("Dzień dobry. To jest kolejny tekst.")
        assert await anext(stream)
        await stream.aclose()
        assert [x async for x in engine.synthesize_stream("Dziękuję.")]
        assert engine.voice is original
        await engine.close()
    asyncio.run(exercise())


def test_disconnect_during_real_inference():
    import anyio
    if not Settings().model_path.exists(): pytest.skip('Download voice for real cancellation test')
    async def exercise():
        engine=LocalEngine(Settings())
        await engine.start()
        stream=engine.synthesize_stream('Dzień dobry. ' + 'To jest długie zdanie testowe ' * 40 + '.')
        assert await anext(stream)
        async def receive():
            async for _ in stream: pass
        async with anyio.create_task_group() as group:
            group.start_soon(receive)
            await anyio.sleep(.01)
            group.cancel_scope.cancel()
        assert not engine.lock.locked()
        assert [x async for x in engine.synthesize_stream('Dziękuję.')]
        await engine.close()
    anyio.run(exercise)
