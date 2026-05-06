# Assistente de Audiodescrição

Software local para apoiar a produção de audiodescrição em vídeos. O foco é ser simples para pessoas leigas: enviar um vídeo, detectar pausas entre falas, revisar os intervalos, escrever/gravar a audiodescrição e exportar arquivos úteis para edição.

Este projeto foi pensado para a necessidade levantada com o Ícaro: uma ferramenta menos poluída do que editores completos, focada na marcação dos tempos de silêncio e na gravação/organização da audiodescrição.

## O que o app faz

- Cria projetos locais a partir de vídeos.
- Detecta automaticamente silêncios usando FFmpeg.
- Lista intervalos úteis para audiodescrição.
- Permite revisar cada intervalo no player de vídeo.
- Mostra um guia de edição com próxima pausa pendente, pausa anterior/próxima e marcação de revisão.
- Permite escrever roteiro de audiodescrição por intervalo.
- Permite gravar áudio pelo navegador usando o microfone.
- Salva cada gravação vinculada ao intervalo correto.
- Salva edições em histórico local para reduzir risco de perda.
- Gera transcrição automática local do vídeo com tempos usando faster-whisper.
- Permite consultar falas antes e depois de cada pausa a partir da transcrição.
- Avisa quando a gravação ficou maior que o espaço disponível.
- Exporta:
  - roteiro em Markdown;
  - CSV completo dos intervalos;
  - SRT para revisão textual;
  - CSV de marcadores para Premiere;
  - CSV de marcadores para DaVinci Resolve;
  - JSON do projeto;
  - faixa WAV de audiodescrição sincronizada;
  - vídeo MP4 final com a audiodescrição misturada ao áudio original.

## O que ele ainda não faz

- Não cria a audiodescrição automaticamente por IA.
- Não entende o conteúdo visual da cena.
- Não substitui revisão humana.
- Não garante compatibilidade perfeita de CSV com todas as versões do Premiere/DaVinci, pois cada versão pode ter regras próprias de importação.
- Não implementa audiodescrição estendida com pausa automática do vídeo; ele apenas alerta quando a gravação ultrapassa o tempo disponível.

## Requisitos

- Python 3.10 ou superior.
- FFmpeg e FFprobe instalados.
- faster-whisper instalado pelas dependências do projeto para transcrição automática.
- Navegador moderno: Chrome, Edge ou Firefox.
- VS Code recomendado.

## Preparação do ambiente no Windows

Abra o projeto no VS Code, abra o terminal PowerShell na raiz da pasta e rode:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python run.py
```

Se o PowerShell bloquear a ativação da venv, rode uma vez:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Depois feche e abra o terminal novamente.

## Instalação do FFmpeg no Windows

Opção simples com Winget:

```powershell
winget search ffmpeg
winget install Gyan.FFmpeg
```

Depois feche e abra novamente o VS Code/terminal.

Se preferir não instalar globalmente, coloque os arquivos abaixo nesta pasta do projeto:

```text
third_party/ffmpeg/bin/ffmpeg.exe
third_party/ffmpeg/bin/ffprobe.exe
```

O sistema procura automaticamente nesse caminho.

## Preparação no macOS/Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
python run.py
```

No macOS, se precisar instalar FFmpeg:

```bash
brew install ffmpeg
```

No Ubuntu/WSL:

```bash
sudo apt update
sudo apt install ffmpeg
```

## Como rodar

Com a venv ativada:

```bash
python run.py
```

O sistema abrirá automaticamente no navegador:

```text
http://127.0.0.1:8765
```

Para encerrar, pressione `Ctrl+C` no terminal.

## Como gerar executável para Windows

Com a venv ativada no Windows:

```powershell
pip install pyinstaller
.\build_windows.bat
```

O executável será criado em:

```text
dist\AssistenteAudioDescricao.exe
```

Observação: o executável continua precisando do FFmpeg. Você pode instalar FFmpeg no Windows ou colocar `ffmpeg.exe` e `ffprobe.exe` em `third_party/ffmpeg/bin/` antes de gerar o executável.

## Estrutura do projeto

```text
assistente-audiodescricao/
├─ app/
│  ├─ main.py                    # Rotas Flask e inicialização do app
│  ├─ core/
│  │  ├─ ffmpeg_utils.py          # Detecção de silêncio e exportações com FFmpeg
│  │  ├─ projects.py              # Criação, carregamento e armazenamento dos projetos
│  │  ├─ exporters.py             # Exportação CSV, SRT, JSON e roteiro
│  │  └─ timecode.py              # Conversões de tempo
│  ├─ templates/index.html        # Interface principal
│  └─ static/
│     ├─ css/styles.css           # Estilos da interface
│     └─ js/app.js                # Lógica do front-end
├─ data/                          # Criada automaticamente; guarda projetos locais
├─ third_party/ffmpeg/bin/         # Opcional: FFmpeg portátil
├─ scripts/                       # Scripts auxiliares
├─ run.py                         # Ponto de entrada
├─ requirements.txt               # Dependências Python
├─ build_windows.bat              # Gera executável Windows
├─ MANUAL_USO.md                  # Manual para usuários
└─ MANUTENCAO.md                  # Manual técnico para manutenção
```

## Fluxo recomendado para teste

1. Rode `python run.py`.
2. Envie um vídeo curto, de preferência MP4.
3. Clique em “Detectar pausas automaticamente”.
4. Use “Próxima pendente” para revisar os intervalos em ordem.
5. Cole uma transcrição com tempos, se tiver, para consultar o contexto das falas.
6. Escreva uma audiodescrição curta em alguns cards.
7. Grave a narração em alguns cards.
8. Confira o histórico de trabalho após salvar.
9. Exporte a faixa `.wav`.
10. Exporte o vídeo final `.mp4`.
11. Valide se a narração não invade falas importantes.

## Boas práticas de audiodescrição no uso do sistema

- Prefira narrar nas pausas naturais entre falas.
- Evite cobrir diálogos, efeitos sonoros importantes ou músicas relevantes.
- Descreva o que é essencial para entender a ação, o espaço, personagens, expressões e informações visuais importantes.
- Use frases curtas quando o intervalo for curto.
- Se o intervalo não for suficiente, marque como observação a necessidade de audiodescrição estendida.
- Revise o resultado com uma pessoa que realmente depende ou utiliza recursos de acessibilidade sempre que possível.

## Licença sugerida

Para projetos acadêmicos e continuidade por outras equipes, recomenda-se usar uma licença permissiva como MIT. Antes de publicar, confira as regras da instituição e das bibliotecas utilizadas.

## Atualização desta versão: upload fracionado para vídeos grandes

Esta versão remove o limite fixo de tamanho total do vídeo. Em vez de enviar o arquivo inteiro em uma única requisição, o navegador divide o vídeo em partes menores e envia uma por vez.

Na prática, isso permite usar vídeos muito grandes, como 9 GB, 20 GB ou mais, desde que:

- exista espaço livre suficiente no disco;
- o navegador consiga ler o arquivo selecionado;
- o computador não seja desligado durante o envio;
- o formato seja aceito pelo FFmpeg/FFprobe.

O progresso agora mostra:

- número da parte enviada;
- quantidade enviada em MB/GB;
- porcentagem geral do upload;
- tempo decorrido;
- etapa de validação do vídeo após o upload.

## Configurações para upload fracionado

Normalmente você não precisa alterar nada. O padrão envia partes de até 64 MB e aceita requisições de até 256 MB.

Para alterar o tamanho das partes no PowerShell:

```powershell
$env:AD_ASSIST_UPLOAD_CHUNK_MB="32"
python run.py
```

Para alterar o limite máximo aceito por requisição:

```powershell
$env:AD_ASSIST_MAX_CHUNK_MB="512"
python run.py
```

Observação: aumentar demais o tamanho das partes não torna necessariamente mais rápido. Para vídeos gigantes, partes de 32 MB a 128 MB costumam ser mais seguras.

## Quando um vídeo muito grande der problema

Tente primeiro uma destas opções:

1. Confirme se há espaço livre no disco. O vídeo será copiado para `data/projects`.
2. Use MP4 H.264/AAC quando possível, pois costuma abrir melhor no navegador.
3. Se a importação falhar na validação, teste converter o arquivo para MP4.
4. Confirme que o FFmpeg está instalado e aparece como “FFmpeg pronto” no topo da tela.

Exemplo de conversão para MP4:

```powershell
ffmpeg -i entrada.mov -c:v libx264 -c:a aac -movflags +faststart saida.mp4
```

## Observação honesta sobre “qualquer tamanho”

O sistema não tem mais limite fixo de upload do tipo 4 GB. Porém nenhum software local consegue garantir tamanho infinito: o limite real passa a ser o espaço em disco, o sistema de arquivos, estabilidade do navegador e tempo de processamento do FFmpeg.

## Atualização desta versão: edição mais segura e acessível

Além do upload fracionado, esta versão melhora o fluxo de trabalho para audiodescrição:

- salvamento atômico de `project.json`, evitando arquivo quebrado em caso de interrupção no meio da escrita;
- histórico local em `data/projects/<id>/history`, criado a cada salvamento;
- restauração de pontos anteriores pela interface;
- lixeira local para projetos arquivados em `data/trash`;
- lixeira de gravações substituídas/removidas em `recordings_trash`;
- autosave de intervalos, observações e transcrição;
- guia de edição com botões para próxima pausa pendente, pausa anterior/próxima e marcar revisado;
- preferências visuais persistentes: alto contraste, texto maior e movimento reduzido;
- transcrição automática local ao carregar um vídeo, com botão para tentar/refazer;
- painel de transcrição com busca, leitura completa e falas próximas de cada pausa;
- exportação de faixa WAV e vídeo MP4 final em tarefa de fundo, para vídeos grandes não travarem a interface.

### Transcrição automática local

Ao criar um projeto, o app inicia uma tarefa de transcrição em segundo plano. A transcrição fica salva em `project.json` e também em `data/projects/<id>/transcription/transcricao.srt` e `transcricao.txt`.

Por padrão, o modelo usado é `small`, em CPU e `int8`, para funcionar melhor em computadores comuns. Dá para alterar por variáveis de ambiente:

```powershell
$env:AD_ASSIST_TRANSCRIBE_MODEL="medium"
$env:AD_ASSIST_TRANSCRIBE_DEVICE="cpu"
$env:AD_ASSIST_TRANSCRIBE_COMPUTE_TYPE="int8"
$env:AD_ASSIST_TRANSCRIBE_LANGUAGE="pt"
```

Na primeira execução, o faster-whisper pode precisar baixar o modelo. Depois disso, a transcrição roda localmente.

### Formatos de transcrição aceitos

O painel de transcrição reconhece SRT/VTT e linhas simples com tempo:

```text
00:01:23 Ícaro entra na sala.
00:01:28 Ele olha para a mesa.
```

Com tempos reconhecidos, cada card de intervalo mostra as falas antes, durante e depois da pausa. Se a transcrição não tiver tempos, ela continua salva e pode ser usada pela busca geral.
