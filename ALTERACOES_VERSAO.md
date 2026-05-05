# Alterações desta versão

Esta versão foi ajustada para vídeos grandes e para um fluxo de edição mais seguro.

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
