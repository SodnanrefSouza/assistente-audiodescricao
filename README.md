# Assistente de Audiodescricao

Software local para apoiar a producao de audiodescricao em videos. A proposta e ajudar uma pessoa ou equipe a encontrar pausas entre falas, revisar esses intervalos, escrever ou gravar a narracao e exportar materiais para edicao.

O projeto foi desenvolvido no contexto da disciplina de Acessibilidade e Inclusao Digital, a partir da necessidade levantada com o Icaro: ter uma ferramenta mais simples que um editor de video completo, focada na organizacao dos tempos de audiodescricao.

## Sumario

- [Objetivo do projeto](#objetivo-do-projeto)
- [Para quem o sistema foi pensado](#para-quem-o-sistema-foi-pensado)
- [Como usar pelo executavel](#como-usar-pelo-executavel)
- [Fluxo de uso](#fluxo-de-uso)
- [Como a deteccao de pausas funciona](#como-a-deteccao-de-pausas-funciona)
- [Como ler as cores da linha do tempo](#como-ler-as-cores-da-linha-do-tempo)
- [Gravacao e revisao da audiodescricao](#gravacao-e-revisao-da-audiodescricao)
- [Exportacoes](#exportacoes)
- [Recursos de acessibilidade](#recursos-de-acessibilidade)
- [Instalacao para desenvolvimento](#instalacao-para-desenvolvimento)
- [Como gerar executavel Windows](#como-gerar-executavel-windows)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Dados salvos localmente](#dados-salvos-localmente)
- [Testes e validacoes](#testes-e-validacoes)
- [Limites conhecidos](#limites-conhecidos)
- [Licenca](#licenca)

## Objetivo do projeto

O Assistente de Audiodescricao nao tenta substituir o trabalho humano de audiodescricao. Ele serve como apoio para uma tarefa especifica:

1. abrir um video;
2. identificar espacos entre falas;
3. indicar quais pausas parecem melhores para gravar;
4. organizar roteiro, status e observacoes;
5. gravar narracoes vinculadas aos intervalos;
6. exportar roteiro, planilhas, audio ou video final.

A ferramenta tambem ajuda a evitar um erro comum: gravar audiodescricao em cima de fala importante. Para isso, a deteccao principal usa a transcricao temporizada das falas do video.

## Para quem o sistema foi pensado

O sistema foi pensado para uso por estudantes, professores, equipes de extensao e pessoas sem experiencia avancada em editores profissionais. Por isso, a interface tenta esconder o que ainda nao pode ser usado e vai abrindo as etapas conforme o projeto avanca.

O fluxo ideal e:

- uma pessoa abre o video;
- o sistema gera ou utiliza a transcricao;
- as pausas entre falas aparecem em uma linha do tempo;
- a equipe revisa os pontos sugeridos;
- a audiodescricao e escrita e gravada;
- o resultado e exportado para revisao ou edicao.

## Como usar pelo executavel

Para usuarios comuns, o caminho recomendado e usar o executavel Windows.

Download pelo GitHub:

```text
https://github.com/SodnanrefSouza/assistente-audiodescricao/releases/latest
```

Na pagina de Releases, baixe `AssistenteAudioDescricao.exe`. O arquivo tambem pode aparecer compactado como `AssistenteAudioDescricao_portatil.zip`.

1. Baixe ou copie o arquivo `AssistenteAudioDescricao.exe`.
2. Coloque o executavel em uma pasta com permissao de escrita, como `Downloads` ou `Documentos`.
3. De dois cliques no executavel.
4. Aguarde o navegador abrir automaticamente.
5. Use a tela do navegador para criar ou abrir um projeto.

O programa roda localmente no computador. Ele cria uma pasta chamada `dados_audio_descricao` ao lado do executavel para guardar videos, projetos, gravacoes e exportacoes.

Observacoes importantes:

- o executavel nao exige instalacao de Python;
- o FFmpeg ja deve estar embutido no pacote gerado para entrega;
- na primeira transcricao, pode ser necessario internet para baixar o modelo de reconhecimento de fala;
- por nao ter assinatura digital comercial, o Windows SmartScreen pode exibir um aviso antes de abrir.

O executavel nao fica versionado como arquivo normal do repositorio porque tem mais de 250 MB. O GitHub bloqueia arquivos grandes em commits comuns. Por isso, o codigo fica no repositorio e o executavel fica publicado em `Releases`, que e o local correto para baixar pacotes prontos.

## Fluxo de uso

### 1. Criar ou abrir projeto

Na lateral esquerda, escolha um video e clique em `Criar projeto`. Tambem e possivel abrir um projeto recente salvo no mesmo computador.

Ao criar o projeto, o video e copiado para a pasta local de dados. Videos grandes sao enviados em partes para evitar falhas por limite de tamanho de requisicao.

### 2. Aguardar checagem de fala

Depois que o projeto e criado, o sistema inicia a checagem das falas do video. Essa etapa usa transcricao automatica local com `faster-whisper`.

Enquanto a checagem nao termina, a deteccao de pausas fica bloqueada. Isso e proposital: a versao atual prioriza encontrar pausas entre falas, nao apenas trechos com som baixo.

### 3. Detectar pausas entre falas

Quando a transcricao fica pronta, aparece o botao `Detectar pausas entre falas`. Ao clicar nele, o sistema procura os espacos entre o fim de uma fala e o inicio da proxima.

Depois disso, o FFmpeg entra como apoio para medir o fundo de audio dentro das pausas. Ele ajuda a avisar se o trecho parece silencioso, tem musica, ambiente ou ruido, mas nao decide sozinho onde existe pausa.

### 4. Revisar pausas na linha do tempo

A linha do tempo mostra regioes do video e, dentro da regiao escolhida, os intervalos encontrados. Ao clicar em uma pausa, o video vai para o tempo correto e os detalhes aparecem na lista de revisao.

A lista de intervalos fica recolhida por padrao para manter a tela limpa. Ela abre automaticamente quando o usuario clica em um intervalo da linha do tempo ou quando escolhe ver as pausas.

### 5. Escrever ou gravar audiodescricao

Cada pausa tem campos para:

- titulo;
- status;
- roteiro da audiodescricao;
- observacoes internas;
- analise de fala e fundo;
- gravacao de audio.

O usuario pode salvar, revisar, descartar, excluir ou editar manualmente o intervalo.

### 6. Exportar

O menu `Exportar` gera arquivos para revisao, apresentacao ou edicao em outros programas.

## Como a deteccao de pausas funciona

A deteccao atual e baseada em duas etapas:

### Etapa principal: transcricao das falas

O sistema gera uma transcricao com tempos. A partir dela, ele identifica:

- quando uma fala termina;
- quando a proxima fala comeca;
- quanto tempo existe entre as duas.

Esse espaco entre uma fala e outra vira uma candidata a pausa para audiodescricao.

Esse comportamento e importante porque, em audiodescricao, o objetivo principal nao e encontrar silencio absoluto. O objetivo e encontrar um momento em que seja possivel narrar sem cobrir uma fala importante.

### Etapa auxiliar: analise do fundo de audio

Depois que as pausas sao encontradas pela transcricao, o sistema mede o fundo de audio com FFmpeg.

Essa medicao serve para classificar o risco do trecho:

- se o fundo parece limpo;
- se existe som ambiente;
- se pode haver musica ou trilha;
- se o trecho precisa ser ouvido antes de gravar.

O som de fundo nao cria a pausa sozinho. Ele apenas ajuda a revisar a qualidade daquela pausa.

### Ajustes de deteccao

No menu `Ajustes de deteccao`, existem parametros para controlar a analise:

- `Sensibilidade do fundo (dB)`: mede o volume do fundo. Valores mais negativos exigem som mais baixo para considerar o fundo limpo.
- `Duracao minima para medir o fundo`: tempo minimo usado para medir o audio dentro de uma pausa.
- `Tempo minimo para narrar`: menor duracao aceita para uma frase curta de audiodescricao.
- `Margem para ouvir contexto`: segundos extras antes e depois quando o usuario clica em `Ver trecho`.
- `Cortar inicio/fim do silencio`: ajuste fino para evitar pegar a borda exata de uma fala.

## Como ler as cores da linha do tempo

As cores indicam recomendacao de revisao:

- **Verde**: boa candidata para gravar. A transcricao nao encontrou fala relevante naquele intervalo e o fundo parece seguro.
- **Amarelo**: pode servir, mas e melhor ouvir antes. Nao ha fala relevante, porem o fundo pode ter musica, ambiente ou ruido.
- **Vermelho**: exige cuidado. Existe fala perto ou dentro da pausa, entao o usuario deve revisar antes de gravar.
- **Cinza**: ainda falta checagem de fala ou a informacao nao esta completa.

Mesmo quando a pausa aparece verde, a revisao humana continua sendo necessaria. A ferramenta ajuda a priorizar, mas nao substitui a decisao da equipe.

## Gravacao e revisao da audiodescricao

### Player de video

O player principal e o proprio componente de video do navegador. Abaixo dele ficam controles de apoio:

- voltar ou avancar por passos pequenos;
- escolher velocidade de revisao;
- adicionar intervalo manual no tempo atual;
- navegar para pausa anterior, proxima pausa ou proxima pendente.

Os botoes de navegacao devem tocar apenas o trecho relacionado a pausa selecionada e parar no final do intervalo, ajudando a validar se a narracao cabe naquele espaco.

### Intervalos manuais

O usuario pode criar intervalos manualmente quando a deteccao nao encontra uma pausa que a equipe considera util.

Depois de criar, e possivel editar:

- inicio;
- fim;
- duracao;
- roteiro;
- status;
- observacoes.

Os campos de tempo aceitam apenas valores numericos dentro de limites definidos, para reduzir risco de erro de digitacao.

### Gravacao pelo navegador

A gravacao usa o microfone autorizado pelo navegador. Cada audio fica vinculado ao intervalo correspondente.

Se a gravacao ultrapassar o tempo da pausa, o sistema avisa que a narracao pode invadir fala ou som importante.

### Previa com video e narracao

Quando ha gravacao associada ao intervalo, o sistema permite revisar o encaixe da audiodescricao com o video, tocando o trecho no tempo correto.

## Exportacoes

O menu `Exportar` fica no topo do projeto e aparece quando ha um projeto aberto.

Arquivos disponiveis:

- `Roteiro .md`: texto organizado para revisao humana.
- `Planilha .csv`: tabela com tempos, status, textos e observacoes.
- `Roteiro .srt`: roteiro em formato de legenda para conferencia visual.
- `CSV Premiere`: marcadores para apoio no Adobe Premiere.
- `CSV DaVinci`: marcadores para apoio no DaVinci Resolve.
- `Projeto .json`: copia completa dos dados do projeto.
- `Faixa AD .wav`: faixa de audiodescricao posicionada nos tempos corretos.
- `Video final .mp4`: video com a audiodescricao misturada ao audio original.

As exportacoes pesadas, como WAV e MP4 final, rodam em tarefa de fundo para evitar travar a interface.

## Recursos de acessibilidade

O projeto tambem foi ajustado pensando no uso acessivel da propria ferramenta.

Recursos implementados:

- `lang="pt-BR"` no documento HTML;
- botoes e menus com rotulos e descricoes;
- mensagens importantes com `aria-live`;
- foco visual reforcado;
- link de pular para a area de edicao;
- navegacao por teclado nos controles principais;
- menus recolhiveis para reduzir poluicao visual;
- preferencia de alto contraste;
- preferencia de texto maior;
- preferencia de menos movimento;
- campos com limites de tamanho e validacao;
- lista de pausas paginada para reduzir peso em videos longos.

### Alto contraste

Aumenta a diferenca visual de textos, bordas e foco. Ajuda pessoas com baixa visao ou telas com pouca qualidade.

### Texto maior

Aumenta textos, campos, botoes e areas principais da interface. A ideia e melhorar leitura sem depender do zoom do navegador.

### Menos movimento

Reduz animacoes e rolagens suaves quando possivel. Isso ajuda pessoas sensiveis a movimento ou que se confundem com transicoes visuais.

### Teste com teclado

Um teste importante e navegar com `Tab`, `Shift + Tab` e `Enter`, verificando se os controles visiveis podem ser acessados sem mouse.

### Teste com leitor de tela

Tambem e recomendado testar com Narrador do Windows, NVDA ou outro leitor de tela. Mesmo que a ferramenta envolva video, esse teste ajuda a encontrar lacunas de rotulo, foco e ordem de leitura.

## Instalacao para desenvolvimento

Esta parte e destinada a quem vai alterar o codigo. Para uso normal, prefira o executavel.

### Requisitos

- Python 3.10 ou superior;
- FFmpeg e FFprobe;
- navegador moderno, como Chrome, Edge ou Firefox;
- Git, se for clonar ou versionar o projeto;
- VS Code ou outra IDE, se quiser editar o codigo.

### O que e FFmpeg

FFmpeg e uma ferramenta de linha de comando usada para ler videos, extrair audio, medir duracao, gerar arquivos WAV/MP4 e misturar a audiodescricao ao video final.

Mesmo que o usuario nao veja o FFmpeg, o sistema depende dele para processar midia.

### Preparacao no Windows

Abra o PowerShell na pasta do projeto:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python run.py
```

Se o PowerShell bloquear a ativacao da venv:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Depois feche e abra o terminal novamente.

### Instalacao do FFmpeg no Windows

Opcao simples com Winget:

```powershell
winget install Gyan.FFmpeg
```

Ou coloque os arquivos portateis nestes caminhos:

```text
third_party/ffmpeg/bin/ffmpeg.exe
third_party/ffmpeg/bin/ffprobe.exe
```

### Preparacao no macOS ou Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
python run.py
```

No macOS:

```bash
brew install ffmpeg
```

No Ubuntu ou WSL:

```bash
sudo apt update
sudo apt install ffmpeg
```

### Como rodar

Com a venv ativada:

```bash
python run.py
```

O sistema abre em:

```text
http://127.0.0.1:8765
```

Para encerrar, pressione `Ctrl+C` no terminal.

## Como gerar executavel Windows

Com a venv ativada no Windows:

```powershell
.\build_windows.bat
```

O executavel e gerado em:

```text
dist/AssistenteAudioDescricao.exe
```

O pacote portatil fica em:

```text
dist/AssistenteAudioDescricao_portatil.zip
```

O script de build tenta incluir FFmpeg e FFprobe no executavel quando eles existem em `third_party/ffmpeg/bin` ou estao instalados no sistema.

Versao publicada para teste:

```text
https://github.com/SodnanrefSouza/assistente-audiodescricao/releases/tag/v2026.07.02
```

Nesta versao, o executavel foi gerado em 02/07/2026, testado localmente em `/api/health` e publicado como asset da Release.

## Estrutura do projeto

```text
assistente-audiodescricao/
|-- app/
|   |-- main.py                    # Aplicacao Flask, rotas e tarefas principais
|   |-- core/
|   |   |-- exporters.py            # Exportacoes CSV, SRT, JSON e Markdown
|   |   |-- ffmpeg_utils.py         # Operacoes com FFmpeg/FFprobe
|   |   |-- interval_tools.py       # Regras de criacao e analise de intervalos
|   |   |-- projects.py             # Criacao, salvamento e exclusao de projetos
|   |   |-- timecode.py             # Conversoes de tempo
|   |   `-- transcription.py        # Transcricao automatica com faster-whisper
|   |-- static/
|   |   |-- css/styles.css          # Estilos da interface
|   |   `-- js/app.js               # Logica do front-end
|   `-- templates/index.html        # Interface principal
|-- scripts/
|   `-- smoke_test.py               # Testes automaticos principais
|-- third_party/ffmpeg/bin/         # FFmpeg portatil opcional
|-- data/                           # Dados locais em desenvolvimento
|-- dist/                           # Executavel gerado
|-- run.py                          # Ponto de entrada
|-- requirements.txt                # Dependencias Python
|-- build_windows.bat               # Build simples para Windows
|-- build_windows.ps1               # Build detalhado para Windows
|-- LICENSE                         # Licenca MIT
`-- README.md                       # Documento central do projeto
```

### Observacao sobre o `main.py`

O arquivo `app/main.py` concentra muitas rotas e tarefas. Isso funciona para o tamanho atual do projeto, mas uma melhoria futura seria separar melhor as rotas em modulos, por exemplo:

- projetos;
- upload;
- transcricao;
- intervalos;
- gravacoes;
- exportacoes.

Essa refatoracao nao foi feita agora para evitar risco de quebrar funcionalidades perto da entrega.

## Dados salvos localmente

Durante desenvolvimento, os projetos ficam em:

```text
data/projects/
```

No executavel Windows, os dados ficam ao lado do executavel:

```text
dados_audio_descricao/projects/
```

Cada projeto tem:

```text
project.json
video original
recordings/
transcription/
exports/
```

Ao excluir um projeto pela interface, a aplicacao remove tambem os arquivos vinculados ao projeto, incluindo videos copiados, gravacoes e exportacoes geradas.

## Variaveis de ambiente

Algumas configuracoes podem ser alteradas por variaveis de ambiente:

```text
AD_ASSIST_HOST=127.0.0.1
AD_ASSIST_PORT=8765
AD_ASSIST_DATA_DIR=/caminho/dos/dados
AD_ASSIST_OPEN_BROWSER=1
AD_ASSIST_UPLOAD_CHUNK_MB=64
AD_ASSIST_MAX_CHUNK_MB=256
AD_ASSIST_FFMPEG_TIMEOUT_SECONDS=21600
AD_ASSIST_TRANSCRIBE_MODEL=small
AD_ASSIST_TRANSCRIBE_DEVICE=cpu
AD_ASSIST_TRANSCRIBE_COMPUTE_TYPE=int8
AD_ASSIST_TRANSCRIBE_LANGUAGE=pt
FFMPEG_PATH=/caminho/ffmpeg
FFPROBE_PATH=/caminho/ffprobe
```

## Testes e validacoes

Antes de entregar ou publicar uma versao, rode:

```powershell
node --check app\static\js\app.js
python -m compileall -q app scripts run.py
python scripts\smoke_test.py
python -m pip check
```

O teste `scripts/smoke_test.py` verifica pontos importantes da interface e do backend, incluindo:

- tela inicial;
- recursos de linha do tempo;
- controles de acessibilidade;
- deteccao baseada em fala;
- criacao e edicao de intervalos;
- comportamento de menus e exportacoes.

Tambem e recomendado testar manualmente:

- criar projeto com video curto;
- aguardar transcricao;
- detectar pausas entre falas;
- revisar uma pausa verde e uma vermelha;
- criar intervalo manual;
- gravar uma audiodescricao curta;
- exportar roteiro e faixa WAV;
- navegar usando teclado.

## Limites conhecidos

- A ferramenta nao entende visualmente a cena do video.
- A audiodescricao precisa ser escrita e revisada por pessoas.
- A transcricao automatica pode errar palavras, tempos ou falas curtas.
- Musica, ruido e sobreposicao de vozes podem atrapalhar a analise.
- O video final gerado e util para teste, mas uma producao final pode exigir revisao em editor profissional.
- O executavel pode ser bloqueado pelo Windows SmartScreen por nao ter assinatura digital comercial.
- Em computadores fracos, videos muito grandes podem demorar para transcrever ou exportar.

## Resposta aos pontos da avaliacao por pares

A avaliacao do outro grupo apontou pontos importantes. Estes foram os encaminhamentos adotados:

- a documentacao foi centralizada neste README;
- a explicacao do fluxo foi atualizada para a versao atual do sistema;
- a licenca passou a ficar em arquivo oficial `LICENSE`;
- a interface passou a esconder etapas que ainda nao estao disponiveis;
- foram reforcados foco visual, navegacao por teclado, menus recolhiveis e preferencias visuais;
- a deteccao de pausas foi explicada como baseada em transcricao, com o audio de fundo apenas como apoio;
- a necessidade de testar com leitor de tela ficou registrada como validacao recomendada.

Pontos mantidos como melhoria futura:

- refatorar `app/main.py` em modulos menores;
- ampliar testes com leitores de tela reais;
- validar formatos de exportacao em versoes especificas de Premiere e DaVinci;
- criar uma pagina REA independente, caso a disciplina exija um material separado do GitHub.

## Licenca

Este projeto usa a licenca MIT. Consulte o arquivo [`LICENSE`](LICENSE).

## Material aberto e REA

O README funciona como material principal de consulta do projeto no GitHub. Ele concentra contexto, instalacao, uso, manutencao, limites e recursos de acessibilidade.

Caso seja necessario entregar um Recurso Educacional Aberto em formato separado, este README pode ser usado como base para gerar uma pagina HTML simples ou um PDF de apoio.
