# Manual de uso — Assistente de Audiodescrição

## Objetivo do software

O Assistente de Audiodescrição foi criado para facilitar uma tarefa específica: encontrar espaços de silêncio entre falas em um vídeo e organizar a gravação da audiodescrição nesses pontos.

Ele não tenta ser um editor de vídeo completo. A proposta é ser uma ferramenta simples, direta e amigável para quem precisa começar a produzir audiodescrição sem se perder em dezenas de botões e menus.

## Tela inicial

A tela é dividida em cinco áreas principais:

1. Novo projeto.
2. Revisão do vídeo.
3. Detecção de pausas.
4. Exportações.
5. Intervalos encontrados.

Também existem três áreas de apoio:

- **Guia de edição**: mostra o andamento e leva para a próxima pausa que precisa de atenção.
- **Transcrição e contexto**: guarda uma transcrição com tempos e mostra falas próximas de cada pausa.
- **Histórico de trabalho**: permite restaurar versões anteriores do projeto.

## Criando um projeto

1. Abra o programa.
2. Clique em “Vídeo” e selecione um arquivo.
3. Dê um nome ao projeto, se quiser.
4. Clique em “Criar projeto”.

O sistema salva o vídeo localmente dentro da pasta `data/projects`. Em vídeos grandes, o arquivo é enviado em partes, então ele não fica preso a um limite fixo como 4 GB.

## Detectando pausas

Depois de criar o projeto:

1. Confira se o vídeo aparece no player.
2. Ajuste os parâmetros, se necessário.
3. Clique em “Detectar pausas automaticamente”.

O programa usa o áudio do vídeo para localizar trechos de baixo volume. Esses trechos são tratados como possíveis espaços para inserir audiodescrição.

### Parâmetros principais

#### Sensibilidade / ruído (dB)

Define o volume abaixo do qual o áudio será considerado silêncio.

- `-35 dB`: bom valor inicial.
- Valor mais negativo, como `-45 dB`: exige silêncio mais real.
- Valor menos negativo, como `-25 dB`: detecta pausas mesmo com mais ruído de fundo.

#### Duração mínima do silêncio

Evita que pausas muito pequenas sejam marcadas.

- `1.0s`: bom início.
- `0.5s`: detecta pausas menores, mas pode gerar excesso de intervalos.
- `2.0s`: detecta apenas pausas maiores.

#### Espaço mínimo útil para AD

Remove intervalos que são pequenos demais para uma narração útil.

- `0.8s`: permite marcações curtas.
- `2.0s`: mostra apenas intervalos mais confortáveis.

#### Margem do preview

Quando você clica em “Ver trecho”, o programa toca alguns segundos antes e depois do intervalo. Isso ajuda a entender o contexto.

## Entendendo os intervalos

Cada intervalo mostra:

- início;
- fim;
- duração útil;
- duração bruta do silêncio;
- qualidade do espaço: curto, bom ou excelente;
- campo para roteiro;
- campo para observações;
- botão para gravação.
- estado de salvamento automático.
- contexto de transcrição, quando houver tempos reconhecidos.

### Qualidade do espaço

- **Curto**: exige uma descrição muito breve.
- **Bom**: permite uma frase simples.
- **Excelente**: permite descrição mais confortável.

## Escrevendo o roteiro

No campo “Roteiro da audiodescrição”, escreva a frase que será narrada naquele intervalo.

Exemplo:

```text
Ícaro caminha até a mesa e pega o celular.
```

Prefira frases objetivas. Não tente narrar tudo que aparece na tela; priorize o que é importante para entender a cena.

O intervalo é salvo automaticamente alguns instantes depois de você parar de digitar. O botão “Salvar intervalo” continua disponível para salvar imediatamente.

## Usando o guia de edição

Depois de detectar pausas, use o painel “Guia de edição” para trabalhar em sequência:

- **Próxima pendente** leva ao próximo intervalo que ainda não foi revisado ou descartado.
- **Pausa anterior** e **Próxima pausa** usam o tempo atual do vídeo para navegar.
- **Marcar revisado** muda o status do intervalo atual para revisado.

Essa navegação ajuda em vídeos longos, porque você não precisa procurar manualmente onde parou.

## Usando transcrição e contexto

Se você tiver uma transcrição do vídeo, cole no campo “Transcrição e contexto”. O sistema reconhece SRT/VTT e também linhas simples com tempo:

```text
00:01:23 Ícaro entra na sala.
00:01:28 Ele olha para a mesa.
```

Quando os tempos são reconhecidos, cada intervalo mostra “Falas próximas da pausa”, separando o que vem antes, durante e depois. Isso ajuda a escrever a audiodescrição sem cobrir uma fala importante.

Se a transcrição não tiver tempos, ela continua salva e pode ser consultada pela busca geral.

## Histórico e recuperação

O projeto salva um ponto de histórico a cada alteração importante: roteiro, status, observações, transcrição, detecção de pausas e gravações.

No painel “Histórico de trabalho”, clique em “Restaurar” para voltar a um ponto anterior. O estado atual também é guardado antes da restauração.

Projetos arquivados vão para `data/trash`. Gravações removidas ou substituídas vão para `recordings_trash` dentro da pasta do projeto. Isso reduz o risco de perder material por engano.

## Gravando a audiodescrição

1. Clique em “Gravar”.
2. Autorize o uso do microfone no navegador.
3. Fale a audiodescrição.
4. Clique em “Parar gravação”.

A gravação fica vinculada ao intervalo correspondente.

Se a gravação ficar maior que o tempo disponível, o sistema mostra um aviso. Isso significa que ela pode invadir uma fala ou som importante no vídeo.

## Exportando arquivos

### Roteiro .md

Gera um arquivo de texto organizado com todos os intervalos e descrições.

Útil para revisão humana, apresentação ao professor ou continuidade do trabalho por outra equipe.

### Planilha .csv

Gera uma planilha com tempos, textos, status e observações.

Útil para organização, acompanhamento e revisão.

### Roteiro .srt

Gera um arquivo de legenda com os textos nos tempos detectados.

Importante: isso não é audiodescrição final. É apenas uma forma de revisar os textos sincronizados.

### CSV Premiere e CSV DaVinci

Gera arquivos de marcação com tempos e observações.

A compatibilidade pode variar conforme a versão do editor. Se a importação automática não funcionar, os arquivos ainda servem como guia de marcação manual.

### Faixa AD .wav

Gera uma faixa de áudio com a audiodescrição posicionada nos tempos corretos do vídeo.

Essa faixa pode ser levada para um editor de vídeo.

Em vídeos grandes, a exportação roda em segundo plano e mostra progresso enquanto o arquivo é preparado.

### Vídeo final .mp4

Gera uma cópia do vídeo original com a audiodescrição misturada ao áudio original.

Use essa opção para teste rápido. Para produção profissional, é melhor revisar a faixa em um editor como DaVinci ou Premiere.

Essa exportação também roda em segundo plano para evitar travamento da interface.

## Cuidados importantes

- A detecção é baseada em volume, não em entendimento do diálogo.
- Música baixa, ruído ambiente ou respiração podem afetar a marcação.
- Nem todo silêncio serve para audiodescrição.
- Às vezes há uma pausa, mas ela contém som importante para a narrativa.
- A revisão humana é essencial.

## Fluxo ideal com o Ícaro

1. Rodar o vídeo no sistema.
2. Detectar pausas automaticamente.
3. Revisar junto com o Ícaro se os intervalos fazem sentido.
4. Escrever descrições curtas.
5. Gravar algumas narrações de teste.
6. Exportar faixa de audiodescrição.
7. Validar se o resultado ajuda de verdade.
8. Ajustar parâmetros e repetir.

## Problemas comuns

### O programa diz que o FFmpeg não foi encontrado

Instale o FFmpeg ou coloque os arquivos `ffmpeg.exe` e `ffprobe.exe` em:

```text
third_party/ffmpeg/bin/
```

Depois reinicie o programa.

### O navegador não deixa gravar o microfone

Verifique se você autorizou o microfone. No Chrome/Edge, clique no cadeado ao lado do endereço e libere o microfone.

### O vídeo não carrega

Tente usar MP4 com codec comum. Alguns formatos podem não tocar bem no navegador mesmo que o FFmpeg consiga ler.

### Apareceram poucos intervalos

Tente:

- aumentar a sensibilidade, por exemplo de `-35` para `-30`;
- diminuir a duração mínima do silêncio;
- diminuir o espaço mínimo útil para AD.

### Apareceram intervalos demais

Tente:

- reduzir a sensibilidade, por exemplo de `-35` para `-45`;
- aumentar a duração mínima do silêncio;
- aumentar o espaço mínimo útil para AD.

## O que acontece ao criar projeto com vídeo grande

Quando você clica em “Criar projeto”, o sistema mostra uma tela de progresso. Para arquivos grandes, o envio é fracionado em partes menores.

As etapas principais são:

1. **Preparando upload fracionado**: o programa calcula quantas partes serão necessárias.
2. **Enviando partes**: o navegador copia o vídeo por pedaços para o programa local.
3. **Montando projeto**: o programa junta o arquivo recebido na pasta do projeto.
4. **Validando duração do vídeo**: o FFmpeg/FFprobe lê o arquivo para confirmar se ele é válido.

Se o arquivo for grande, é normal demorar. A tela mostra porcentagem, parte atual, quantidade enviada e tempo decorrido.

## O que acontece ao detectar pausas

A detecção roda em segundo plano. A porcentagem é uma estimativa baseada no tempo do vídeo que o FFmpeg já analisou. Em vídeos muito curtos, a porcentagem pode pular rapidamente. Em vídeos longos, ela deve avançar aos poucos.

## Se der erro

O sistema mostra uma mensagem no topo da página e também dentro da tela de processamento. Leia a mensagem e tente a correção sugerida.

Erros comuns:

- **FFmpeg não encontrado**: instale FFmpeg ou coloque `ffmpeg.exe` e `ffprobe.exe` em `third_party/ffmpeg/bin/`.
- **Parte do upload muito grande**: diminua `AD_ASSIST_UPLOAD_CHUNK_MB` ou aumente `AD_ASSIST_MAX_CHUNK_MB`. O tamanho total do vídeo não tem mais limite fixo; o limite principal é o espaço em disco.
- **Vídeo sem áudio**: use um vídeo que tenha faixa de áudio.
- **Formato não suportado**: converta para MP4.
- **Permissão negada**: feche o vídeo em outros programas e tente novamente.

## Teste recomendado antes de usar vídeo longo

Antes de usar uma gravação muito grande, teste com um vídeo curto de 30 segundos a 2 minutos. Assim você confirma que:

- o FFmpeg está funcionando;
- o navegador está aceitando o vídeo;
- o microfone funciona;
- as exportações aparecem corretamente.

## Sobre vídeos de qualquer tamanho

Esta versão foi ajustada para aceitar vídeos grandes usando upload fracionado. Isso significa que o vídeo é enviado em partes menores, em vez de tentar enviar tudo de uma vez.

Mesmo assim, “qualquer tamanho” tem limites práticos:

- precisa haver espaço livre no disco;
- o computador precisa permanecer ligado;
- o navegador não pode ser fechado durante o envio;
- o FFmpeg precisa conseguir ler o formato do arquivo;
- a análise de pausas em vídeos muito longos pode levar bastante tempo.

Para o uso com o Ícaro, o ideal é testar primeiro com um vídeo curto e depois validar com o vídeo real grande.
