# Alterações desta versão

Esta versão foi ajustada para vídeos grandes.

## O que mudou

- Removido o limite fixo de tamanho total do vídeo.
- Upload agora é fracionado em partes menores.
- A interface mostra a parte atual, porcentagem, tamanho enviado e tempo decorrido.
- O backend recebe cada parte e monta o arquivo localmente antes de criar o projeto.
- Mensagens de erro foram ajustadas para diferenciar erro de parte enviada, erro de formato e erro de validação pelo FFmpeg.

## Limite real

O sistema não impõe mais um limite total como 4 GB. Porém o limite prático continua sendo:

- espaço livre em disco;
- estabilidade do navegador;
- tempo de processamento do FFmpeg;
- capacidade do computador;
- formato do arquivo de vídeo.

## Arquivos principais alterados

- `app/main.py`: novas rotas de upload fracionado.
- `app/core/projects.py`: função para importar vídeo já recebido.
- `app/static/js/app.js`: envio em partes com progresso.
- `app/templates/index.html`: texto de ajuda atualizado.
- `README.md`, `MANUAL_USO.md`, `MANUTENCAO.md`: documentação atualizada.
