"""Real network smoke test. Start python run.py first; no synthetic audio."""
import argparse
import io
import json
from pathlib import Path
import time
import wave
import httpx


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:7001')
    parser.add_argument('--server-log', type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    out = root / 'artifacts'
    out.mkdir(exist_ok=True)
    sentences = ['Dzień dobry, w czym mogę dzisiaj pomóc?',
                 'Do zapłaty są dwieście czterdzieści dziewięć złotych i dziewięćdziesiąt dziewięć groszy.']
    with httpx.Client(base_url=args.url, timeout=60) as client:
        health = client.get('/health').raise_for_status().json()
        assert health['voice'] == 'pl_PL-mc_speech-medium'
        assert health['parameters'] == dict(length_scale=1.0, noise_scale=0.85, noise_w_scale=1.0, volume=1.0)
        assert health['model_load_count'] == 1
        for i, text in enumerate(sentences, 1):
            response = client.post('/synthesize', json={'text':text}).raise_for_status()
            with wave.open(io.BytesIO(response.content)) as wav:
                assert wav.getnframes()>0 and wav.getframerate()==22050
                assert any(wav.readframes(wav.getnframes()))
            (out / f'smoke_{i}.wav').write_bytes(response.content)
        # Many natural sentences make first-byte-before-inference-end observable.
        text = ' '.join(sentences * 8)
        started = time.perf_counter()
        first_at = None
        count = 0
        data = bytearray()
        with client.stream('POST', '/synthesize/stream', json={'text':text}) as response:
            response.raise_for_status()
            headers = dict(response.headers)
            for block in response.iter_bytes():
                if not block:
                    continue
                if first_at is None:
                    first_at = time.time()
                    client_latency = time.perf_counter()-started
                    # Independent health request while audio generation continues.
                    assert client.get('/health').raise_for_status().json()['busy']
                    assert client.post('/synthesize',json={'text':'Test'}).status_code==429
                count += 1
                data.extend(block)
        elapsed = time.perf_counter()-started
        assert len(data)>0 and len(data)%2==0 and count>1 and client_latency<elapsed
        assert headers['x-audio-encoding']=='pcm_s16le'
        sample_rate=int(headers['x-sample-rate'])
        with wave.open(str(out/'smoke_stream.wav'),'wb') as wav:
            wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(sample_rate); wav.writeframes(data)
        assert client.get('/health').json()['model_load_count']==1
        report = dict(health=health, client_first_chunk_seconds=client_latency,
                      server_first_chunk_seconds=float(headers['x-first-audio-latency-seconds']),
                      stream_total_seconds=elapsed, network_chunks=count, bytes=len(data),
                      request_id=headers['x-request-id'], client_first_chunk_epoch=first_at)
        if args.server_log:
            deadline=time.monotonic()+5
            result=None
            while time.monotonic()<deadline:
                for line in args.server_log.read_text().splitlines():
                    if 'tts_complete ' in line:
                        row=json.loads(line.split('tts_complete ',1)[1])
                        if row['request_id']==report['request_id']: result=row
                if result: break
                time.sleep(.05)
            assert result and result['complete'] and result['chunks']>=2
            assert first_at < result['finished_at'], 'First network audio arrived after inference finished'
            report['server_metrics']=result
            report['first_network_chunk_before_generation_end']=True
        # Disconnect mid-stream, then ensure the engine slot is eventually reusable.
        with client.stream('POST','/synthesize/stream',json={'text':text}) as response:
            response.raise_for_status()
            assert next(response.iter_bytes())
        deadline=time.monotonic()+10
        while client.get('/health').json()['busy']:
            assert time.monotonic()<deadline, 'Slot stuck after disconnect'
            time.sleep(.05)
        assert client.post('/synthesize',json={'text':'Dziękuję.'}).status_code==200
        report['disconnect_recovery']=True
        (out/'smoke_results.json').write_text(json.dumps(report,indent=2))
        print(json.dumps(report,indent=2))


if __name__=='__main__': main()
