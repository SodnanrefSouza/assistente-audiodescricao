# Alterações desta versão

Esta versão foi ajustada para vídeos grandes e para um fluxo de edição mais seguro.

## Ajustes após teste do grupo - 25/05

- Os botões do guia de edição agora reproduzem apenas o trecho da pausa e param no final, como já acontecia no botão "Ver trecho" dos cards.
- O salto para trechos distantes do vídeo foi ajustado para pausar, reposicionar e só então tocar, reduzindo travadas no player.
- A transcrição ficou recolhida como recurso opcional, para não pesar na interface principal.
- As configurações de ruído e tempo mínimo foram descritas com exemplos mais claros.
- Os cards avisam quando a transcrição temporizada indica fala dentro de uma pausa sugerida.
- A transcrição automática passou a detectar o idioma por padrão, em vez de forçar português.
- A tela ganhou uma linha do tempo clicável para revisar as pausas visualmente, sem depender só dos cards.
- Foi adicionado o painel "Fala x trilha sonora", separando voz encontrada na transcrição dos trechos de som baixo/trilha/ambiente marcados pelo FFmpeg.
- Foi criado um teste automático de fumaça em `scripts/smoke_test.py` para checar tela inicial, saúde do app e sintaxe do JavaScript.
- A linha do tempo agora agrupa muitos intervalos em blocos clicáveis, evitando a faixa poluída quando um vídeo tem centenas de pausas.
- A área explícita de transcrição foi escondida da interface; o app mostra apenas o resultado útil de voz/fundo.
- A detecção de pausas agora mede também o fundo de áudio por RMS/FFmpeg, separando silêncio quase puro, fundo baixo possível e fundo audível. Isso ajuda a diferenciar ausência de fala de trechos com música, trilha, ambiente ou ruído que precisam ser ouvidos antes de gravar.

## O que mudou

- Removido o limite fixo de tamanho total do vídeo.
- Upload agora é fracionado em partes menores.
- A interface mostra a parte atual, porcentagem, tamanho enviado e tempo decorrido.
- O backend recebe cada parte e monta o arquivo localmente antes de criar o projeto.
- Mensagens de erro foram ajustadas para diferenciar erro de parte enviada, erro de formato e erro de validação pelo FFmpeg.
- `project.json` agora é salvo de forma atômica.
- Cada salvamento gera histórico local em `data/projects/<id>/history`.
- A interface permite restaurar pontos do histórico.
- Remover projeto agora arquiva em `data/trash`.
- Remover ou substituir gravação move o arquivo anterior para `recordings_trash`.
- Intervalos, observações e transcrição têm autosave.
- A interface ganhou guia de edição, navegação por pausas, próxima pendente e marcação de revisão.
- A interface ganhou preferências visuais persistentes para alto contraste, texto maior e movimento reduzido.
- O painel de transcrição aceita SRT/VTT ou linhas com tempo para mostrar contexto antes/depois das pausas.
- Exportação de faixa WAV e vídeo final MP4 roda em tarefa de fundo.

## Limite real

O sistema não impõe mais um limite total como 4 GB. Porém o limite prático continua sendo:

- espaço livre em disco;
- estabilidade do navegador;
- tempo de processamento do FFmpeg;
- capacidade do computador;
- formato do arquivo de vídeo.

## Arquivos principais alterados

- `app/main.py`: novas rotas de upload fracionado.
- `app/core/projects.py`: histórico, salvamento atômico, lixeira local e importação de vídeo já recebido.
- `app/core/ffmpeg_utils.py`: exportações longas com timeout configurável e ajustes de vídeo final.
- `app/static/js/app.js`: envio em partes, guia de edição, autosave, transcrição, histórico e exportações em segundo plano.
- `app/templates/index.html`: novas áreas de guia, transcrição e histórico.
- `app/static/css/styles.css`: interface mais limpa e foco visível.
- `README.md`, `MANUAL_USO.md`, `MANUTENCAO.md`: documentação atualizada.
