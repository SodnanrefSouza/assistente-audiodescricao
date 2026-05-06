# Manual técnico de manutenção

## Visão geral

O sistema é uma aplicação local em Python com Flask no backend e HTML/CSS/JavaScript no frontend. A interface roda no navegador, mas tudo é executado localmente no computador do usuário.

A escolha por Flask + navegador foi feita porque:

- evita criar uma interface desktop complexa;
- permite usar o microfone com a API nativa do navegador;
- facilita manutenção por equipes que já conhecem Python;
- permite empacotar o servidor local em executável com PyInstaller.

## Arquitetura

```text
Navegador
  ├─ upload de vídeo
  ├─ player HTML5
  ├─ gravação pelo MediaRecorder
  └─ interface dos intervalos

Flask local
  ├─ recebe vídeos e gravações
  ├─ chama FFmpeg/FFprobe
  ├─ gera transcrição local com faster-whisper
  ├─ salva project.json
  ├─ gera CSV/SRT/JSON/MD
  └─ gera WAV/MP4 final

FFmpeg
  ├─ detecta silêncios com silencedetect
  ├─ mede duração de mídia com ffprobe
  ├─ posiciona gravações com adelay
  └─ mistura áudio com amix
```

## Arquivos principais

### `run.py`

Ponto de entrada. Importa `run_app()` de `app/main.py`.

### `app/main.py`

Contém:

- criação do Flask;
- rotas da API;
- rotas de mídia;
- exportações;
- abertura automática do navegador;
- inicialização com Waitress.

Principais rotas:

```text
GET    /                         Interface principal
GET    /api/health                Verifica FFmpeg
GET    /api/projects              Lista projetos
POST   /api/projects              Cria projeto
GET    /api/projects/<id>         Lê projeto
DELETE /api/projects/<id>         Arquiva projeto em data/trash
GET    /api/projects/<id>/history Lista pontos do histórico
POST   /api/projects/<id>/history/<snapshot>/restore Restaura histórico
POST   /api/projects/<id>/transcript Salva transcrição/contexto
POST   /api/projects/<id>/transcript/start Gera transcrição automática em segundo plano
POST   /api/projects/<id>/detect  Detecta silêncios
POST   /api/projects/<id>/intervals/<index>       Salva roteiro/status
POST   /api/projects/<id>/recordings/<index>      Salva gravação
GET    /api/projects/<id>/export/<tipo>           Exporta arquivos
POST   /api/projects/<id>/export/<tipo>/start     Exporta WAV/MP4 em segundo plano
GET    /api/jobs/<job_id>/download                Baixa exportação pronta
```

### `app/core/ffmpeg_utils.py`

Responsável por:

- localizar `ffmpeg` e `ffprobe`;
- ler duração do vídeo;
- verificar faixa de áudio;
- detectar silêncios;
- montar a faixa de audiodescrição e o vídeo final.

### `app/core/transcription.py`

Responsável por:

- extrair áudio mono 16 kHz do vídeo com FFmpeg;
- chamar `faster-whisper` para reconhecer as falas;
- salvar `transcricao.srt` e `transcricao.txt` na pasta do projeto;
- devolver texto temporizado para o painel de transcrição e para os cards de pausa.

A detecção usa este conceito:

```bash
ffmpeg -i video.mp4 -af silencedetect=noise=-35dB:d=1.0 -f null -
```

O FFmpeg retorna linhas contendo `silence_start`, `silence_end` e `silence_duration`. O sistema interpreta essas linhas e transforma em intervalos editáveis.

### `app/core/projects.py`

Responsável por criar, salvar, carregar, listar, arquivar e restaurar projetos.

Cada projeto é salvo em:

```text
data/projects/<project_id>/project.json
```

Cada salvamento cria um snapshot em:

```text
data/projects/<project_id>/history/
```

Projetos removidos pela interface são movidos para:

```text
data/trash/
```

Gravações removidas ou substituídas são movidas para:

```text
data/projects/<project_id>/recordings_trash/
```

Estrutura simplificada:

```json
{
  "id": "abc123",
  "title": "Projeto",
  "video_filename": "video.mp4",
  "duration": 120.5,
  "settings": {},
  "intervals": [],
  "notes": "",
  "transcript": {
    "text": "",
    "source": "manual",
    "updated_at": "2026-05-05T17:30:00"
  }
}
```

### `app/core/exporters.py`

Responsável por exportações textuais:

- JSON;
- CSV;
- SRT;
- Markdown;
- CSV de marcadores.

### `app/static/js/app.js`

Controla a interface:

- upload;
- abertura de projetos;
- detecção;
- renderização de intervalos;
- gravação com `MediaRecorder`;
- envio das gravações;
- exportações.

### `app/templates/index.html`

Estrutura visual da interface.

### `app/static/css/styles.css`

Estilos da aplicação.

## Como os dados são armazenados

Por padrão, durante desenvolvimento:

```text
data/projects/
```

Em executável Windows:

```text
pasta_do_executavel/dados_audio_descricao/projects/
```

É possível alterar com variável de ambiente:

```bash
AD_ASSIST_DATA_DIR=/caminho/desejado python run.py
```

## Como a gravação funciona

A gravação usa `navigator.mediaDevices.getUserMedia()` e `MediaRecorder` no navegador.

O áudio é enviado ao backend como `.webm` e salvo em:

```text
data/projects/<id>/recordings/intervalo_001.webm
```

Depois, no exportador de faixa AD, o FFmpeg posiciona cada gravação no tempo correto usando `adelay`.

## Como a faixa de audiodescrição é gerada

O sistema cria uma base silenciosa do tamanho do vídeo:

```bash
anullsrc=channel_layout=stereo:sample_rate=48000
```

Depois cada gravação é atrasada até o tempo do intervalo:

```bash
adelay=<milissegundos>|<milissegundos>
```

Por fim, tudo é misturado com `amix`.

## Como o vídeo final é gerado

O sistema mistura:

- áudio original do vídeo;
- faixa WAV de audiodescrição.

Depois gera um MP4 final com vídeo copiado e áudio AAC.

## Pontos de atenção para manutenção

### 1. Detecção por silêncio não é detecção semântica

O sistema detecta baixo volume, não necessariamente ausência de fala. Se houver música baixa, ruído ambiente ou som importante, ele pode marcar ou ignorar intervalos incorretamente.

Evolução possível: usar VAD, como WebRTC VAD ou modelos de diarização.

### 2. Compatibilidade do player

O navegador pode não tocar todos os codecs. MP4/H.264/AAC é o mais seguro.

Se um vídeo for aceito pelo FFmpeg mas não tocar no browser, uma melhoria seria criar uma rota de conversão para MP4 compatível.

### 3. Exportação para editores

CSV de Premiere/DaVinci pode variar por versão. O formato atual é genérico e útil como guia.

Evolução possível: implementar exportação EDL, XML/FCPXML ou formatos específicos validados em versões reais dos editores.

### 4. Executável

PyInstaller pode exigir ajustes se novas dependências forem adicionadas. Mantenha o build simples e teste em uma máquina limpa.

## Como adicionar uma nova exportação

1. Crie uma função em `app/core/exporters.py`.
2. Adicione um novo caso em `app/main.py` na rota `/export/<kind>`.
3. Adicione um botão em `index.html` com `data-export="novo_tipo"`.

## Como adicionar transcodificação automática

Sugestão de nova função:

```python
def transcode_to_browser_mp4(input_path, output_path):
    ffmpeg -i input -c:v libx264 -c:a aac -movflags +faststart output.mp4
```

Depois, ao criar projeto, salvar uma versão `preview.mp4` para o player.

## Como adicionar audiodescrição estendida

Audiodescrição estendida exige pausar o vídeo ou inserir tempo extra entre trechos. Uma abordagem possível:

1. Separar o vídeo em segmentos.
2. Inserir telas congeladas ou pausas no ponto da descrição.
3. Acrescentar a narração.
4. Concatenar os segmentos.

Isso é mais complexo e deve ser tratado como versão futura.

## Sugestões para próximas equipes

- Testar o sistema com vídeos reais do Ícaro.
- Criar modo “oficina”, com exemplos e dicas na interface.
- Criar opção de imprimir roteiro em PDF.
- Criar importação/exportação de projetos para compartilhar entre computadores.
- Criar transcodificação automática para MP4 compatível com navegador.
- Criar modo de validação com checklist de acessibilidade.
- Melhorar exportação para DaVinci/Premiere com formatos oficiais.
- Adicionar atalhos de teclado para revisão rápida.

## Comandos úteis de desenvolvimento

```bash
python -m venv .venv
source .venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
python run.py
```

No Windows:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python run.py
```

## Variáveis de ambiente

```text
AD_ASSIST_PORT=8765
AD_ASSIST_HOST=127.0.0.1
AD_ASSIST_DATA_DIR=/caminho/dos/dados
AD_ASSIST_UPLOAD_CHUNK_MB=64
AD_ASSIST_MAX_CHUNK_MB=256
AD_ASSIST_FFMPEG_TIMEOUT_SECONDS=21600
FFMPEG_PATH=/caminho/ffmpeg
FFPROBE_PATH=/caminho/ffprobe
```


## Upload fracionado de vídeos grandes

A versão atual não usa mais um upload único para vídeos grandes. O front-end divide o arquivo com `File.slice()` e envia as partes sequencialmente.

Rotas principais:

```text
POST /api/projects/upload/start
POST /api/projects/upload/chunk
POST /api/projects/upload/finish
DELETE /api/projects/upload/<upload_id>
```

Fluxo:

1. `/upload/start` cria uma sessão temporária em `data/upload_sessions`.
2. `/upload/chunk` recebe cada parte e grava em um arquivo `.part`.
3. `/upload/finish` confere o tamanho final, cria o projeto e move o vídeo para `data/projects/<id>/video.ext`.
4. Se falhar, o front-end tenta cancelar a sessão temporária.

Variáveis relevantes:

- `AD_ASSIST_UPLOAD_CHUNK_MB`: tamanho recomendado de cada parte enviada pelo navegador. Padrão: `64`.
- `AD_ASSIST_MAX_CHUNK_MB`: limite máximo por requisição Flask. Padrão: `256`.

O tamanho total do vídeo não é limitado pela aplicação. O limite real é espaço em disco, sistema de arquivos, navegador e tempo de processamento.

## Histórico, autosave e recuperação

`ProjectStore.save()` faz escrita atômica: grava primeiro em `project.json.tmp` e depois substitui `project.json`. Antes de substituir, guarda uma cópia do estado anterior em `history`.

O front-end usa autosave com debounce para:

- intervalos;
- observações gerais;
- transcrição.

O histórico retém os pontos mais recentes definidos por `HISTORY_LIMIT` em `app/core/projects.py`.

## Transcrição

A transcrição é armazenada dentro do próprio `project.json`, no campo `transcript`.

O parser de contexto fica no front-end, em `app/static/js/app.js`, e reconhece:

- blocos SRT/VTT com `-->`;
- linhas simples começando com tempo, como `00:01:23 fala`.

O sistema não faz transcrição automática. Ele apenas organiza e consulta o texto informado pelo usuário.

## Tarefas em segundo plano e progresso

A rota principal de detecção com progresso é:

```text
POST /api/projects/<project_id>/detect/start
```

Ela cria uma tarefa em memória no `JobManager` e retorna um `job_id`. O front-end consulta:

```text
GET /api/jobs/<job_id>
```

As exportações pesadas usam o mesmo mecanismo:

```text
POST /api/projects/<project_id>/export/ad_audio/start
POST /api/projects/<project_id>/export/final_video/start
GET  /api/jobs/<job_id>/download
```

O estado da tarefa pode ser:

- `running`: ainda processando;
- `done`: concluída com sucesso;
- `error`: falhou com mensagem amigável.

A porcentagem é atualizada por `detect_silences_with_progress()` em `app/core/ffmpeg_utils.py`. A função usa o progresso informado pelo FFmpeg e calcula uma estimativa com base na duração total do vídeo.

### Limitação técnica

O `JobManager` é em memória. Isso é suficiente para uma aplicação local e de usuário único, mas significa que, se o programa for fechado durante uma tarefa, o histórico da tarefa em andamento é perdido. Os projetos salvos continuam no disco normalmente.

### Onde mexer para melhorar progresso

- Upload de vídeo: `app/static/js/app.js`, funções `uploadProjectInChunks()` e `postChunkWithProgress()`.
- Detecção de pausas: `app/main.py`, rota `/detect/start`.
- Leitura do progresso do FFmpeg: `app/core/ffmpeg_utils.py`, função `detect_silences_with_progress()`.
- Interface visual do loading: `app/templates/index.html` e `app/static/css/styles.css`.

## Tratamento amigável de erros

As mensagens amigáveis ficam em `friendly_exception_message()` no arquivo `app/main.py`.

Ao adicionar uma nova etapa que pode falhar, prefira lançar exceções com texto claro para usuário leigo. Exemplo:

```python
raise RuntimeError("O vídeo não possui faixa de áudio. Não há como detectar pausas entre falas.")
```

O front-end exibe o erro no painel superior por meio da função `showError()` em `app/static/js/app.js`.
