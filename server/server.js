const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');

const execPromise = promisify(exec);

const app = express();
const PORT = 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontd')));

// Criar pasta de downloads temporários
const TEMP_DIR = path.join(__dirname, 'temp_downloads');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Sua chave da API do YouTube
const YOUTUBE_API_KEY = 'AIzaSyD-cReFG_VB6QRjGIjScesFE7Z0_Mr5sJw';

// Verificar se yt-dlp está disponível
let ytDlpAvailable = false;

async function checkYtDlp() {
  try {
    await execPromise('yt-dlp --version');
    console.log('✅ yt-dlp está instalado');
    ytDlpAvailable = true;
    return true;
  } catch (error) {
    console.log('⚠️ yt-dlp NÃO está instalado');
    console.log('📥 Instale com: pip install yt-dlp');
    console.log('🔗 Ou baixe: https://github.com/yt-dlp/yt-dlp/releases');
    ytDlpAvailable = false;
    return false;
  }
}

// Rota para buscar vídeos
app.get('/api/videos', async (req, res) => {
  try {
    const query = req.query.q || '';
    let url;

    if (query) {
      url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=50&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&regionCode=BR&key=${YOUTUBE_API_KEY}`;
    } else {
      url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&chart=mostPopular&maxResults=50&videoCategoryId=10&regionCode=BR&key=${YOUTUBE_API_KEY}`;
    }

    const response = await axios.get(url);
    
    const videos = response.data.items.map(item => ({
      id: item.id.videoId || item.id,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails.high.url,
      channelTitle: item.snippet.channelTitle,
      description: item.snippet.description
    }));

    res.json({ success: true, videos });
  } catch (error) {
    console.error('Erro ao buscar vídeos:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao buscar vídeos do YouTube',
      message: error.message 
    });
  }
});

// Download usando yt-dlp
app.get('/api/download', async (req, res) => {
  let tempFilePath = null;
  
  try {
    const { videoId, type } = req.query;
    
    if (!videoId || !type) {
      return res.status(400).json({ 
        success: false, 
        error: 'VideoId e type são obrigatórios' 
      });
    }

    // Verificar se yt-dlp está disponível
    if (!ytDlpAvailable) {
      return res.status(503).json({
        success: false,
        error: 'yt-dlp não está instalado',
        message: 'O yt-dlp é necessário para fazer downloads.',
        installGuide: {
          windows: 'Baixe yt-dlp.exe de https://github.com/yt-dlp/yt-dlp/releases e coloque na pasta do projeto',
          linux: 'Execute: sudo apt install yt-dlp ou pip install yt-dlp',
          mac: 'Execute: brew install yt-dlp ou pip install yt-dlp'
        }
      });
    }

    console.log(`📥 Iniciando download: ${videoId} - Tipo: ${type}`);

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const timestamp = Date.now();
    const sanitizedId = videoId.replace(/[^a-zA-Z0-9]/g, '_');
    
    let command;
    let extension;
    let outputTemplate;
    
    if (type === 'audio') {
      extension = 'mp3';
      outputTemplate = path.join(TEMP_DIR, `${timestamp}_${sanitizedId}.%(title)s.${extension}`);
      
      // Download apenas áudio em MP3
      command = `yt-dlp -x --audio-format mp3 --audio-quality 0 --embed-thumbnail --add-metadata -o "${outputTemplate}" "${videoUrl}"`;
    } else {
      extension = 'mp4';
      outputTemplate = path.join(TEMP_DIR, `${timestamp}_${sanitizedId}.%(title)s.${extension}`);
      
      // Download vídeo + áudio em MP4
      command = `yt-dlp -f "bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4 -o "${outputTemplate}" "${videoUrl}"`;
    }

    console.log('🔧 Executando comando yt-dlp...');

    // Executar yt-dlp com timeout de 5 minutos
    const { stdout, stderr } = await Promise.race([
      execPromise(command, {
        maxBuffer: 1024 * 1024 * 100, // 100MB buffer
        timeout: 300000 // 5 minutos
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Download timeout após 5 minutos')), 300000)
      )
    ]);
    
    if (stderr && !stderr.includes('Deleting original file')) {
      console.log('⚠️ stderr:', stderr);
    }

    // Encontrar o arquivo baixado
    const files = fs.readdirSync(TEMP_DIR).filter(f => 
      f.startsWith(`${timestamp}_${sanitizedId}`)
    );
    
    if (files.length === 0) {
      throw new Error('Arquivo não encontrado após download');
    }

    const downloadedFile = path.join(TEMP_DIR, files[0]);
    
    // Sanitizar nome do arquivo para download
    let originalFilename = files[0]
      .replace(`${timestamp}_${sanitizedId}.`, '')
      .replace(/[<>:"|?*]/g, '_')
      .substring(0, 200); // Limitar tamanho do nome
    
    console.log('✅ Arquivo pronto:', originalFilename);

    // Verificar se arquivo existe
    if (!fs.existsSync(downloadedFile)) {
      throw new Error('Arquivo não encontrado no sistema');
    }

    // Enviar arquivo para o cliente
    res.download(downloadedFile, originalFilename, (err) => {
      // Deletar arquivo temporário após download
      if (fs.existsSync(downloadedFile)) {
        fs.unlink(downloadedFile, (unlinkErr) => {
          if (unlinkErr) {
            console.error('❌ Erro ao deletar arquivo temp:', unlinkErr);
          } else {
            console.log('🗑️ Arquivo temporário deletado');
          }
        });
      }

      if (err) {
        console.error('❌ Erro ao enviar arquivo:', err);
        if (!res.headersSent) {
          res.status(500).json({ 
            success: false, 
            error: 'Erro ao enviar arquivo',
            message: err.message 
          });
        }
      } else {
        console.log('✅ Download concluído com sucesso!');
      }
    });

  } catch (error) {
    console.error('❌ Erro no download:', error.message);
    console.error('Stack:', error.stack);
    
    // Limpar arquivos temporários em caso de erro
    try {
      const files = fs.readdirSync(TEMP_DIR);
      const timestamp = tempFilePath ? path.basename(tempFilePath).split('_')[0] : '';
      
      files.forEach(file => {
        if (timestamp && file.startsWith(timestamp)) {
          const filePath = path.join(TEMP_DIR, file);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log('🗑️ Arquivo temporário removido:', file);
          }
        }
      });
    } catch (cleanupError) {
      console.error('Erro ao limpar arquivos:', cleanupError.message);
    }
    
    if (!res.headersSent) {
      let errorResponse = {
        success: false,
        error: 'Erro ao fazer download',
        message: error.message
      };

      // Mensagens de erro específicas
      if (error.message.includes('timeout')) {
        errorResponse.error = 'Download demorou muito tempo';
        errorResponse.suggestion = 'Tente novamente ou escolha um vídeo menor';
      } else if (error.message.includes('not found') || error.message.includes('não encontrado')) {
        errorResponse.error = 'Vídeo não encontrado ou indisponível';
        errorResponse.suggestion = 'Verifique se o vídeo ainda existe no YouTube';
      } else if (error.message.includes('private') || error.message.includes('privado')) {
        errorResponse.error = 'Vídeo privado ou restrito';
        errorResponse.suggestion = 'Este vídeo não pode ser baixado';
      }

      res.status(500).json(errorResponse);
    }
  }
});

// Obter informações do vídeo
app.get('/api/video-info/:videoId', async (req, res) => {
  try {
    const videoId = req.params.videoId;
    
    // Usar API do YouTube diretamente (mais confiável)
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${YOUTUBE_API_KEY}`;
    const response = await axios.get(url);
    
    if (response.data.items && response.data.items.length > 0) {
      const video = response.data.items[0];
      res.json({
        success: true,
        info: {
          title: video.snippet.title,
          duration: video.contentDetails.duration,
          author: video.snippet.channelTitle,
          thumbnail: video.snippet.thumbnails.high.url,
          description: video.snippet.description
        }
      });
    } else {
      res.status(404).json({ 
        success: false, 
        error: 'Vídeo não encontrado' 
      });
    }
  } catch (error) {
    console.error('Erro ao obter info:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao buscar informações do vídeo',
      message: error.message 
    });
  }
});

// Verificar status do servidor
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    ytDlpAvailable,
    tempDir: TEMP_DIR,
    timestamp: new Date().toISOString()
  });
});

// Limpar arquivos temporários antigos (a cada 10 minutos)
setInterval(() => {
  try {
    fs.readdir(TEMP_DIR, (err, files) => {
      if (err) {
        console.error('Erro ao ler diretório temp:', err);
        return;
      }
      
      const now = Date.now();
      files.forEach(file => {
        const filePath = path.join(TEMP_DIR, file);
        fs.stat(filePath, (err, stats) => {
          if (err) return;
          
          const fileAge = now - stats.mtimeMs;
          // Deletar arquivos com mais de 30 minutos
          if (fileAge > 1800000) {
            fs.unlink(filePath, (err) => {
              if (!err) {
                console.log('🗑️ Arquivo antigo deletado:', file);
              }
            });
          }
        });
      });
    });
  } catch (error) {
    console.error('Erro na limpeza automática:', error);
  }
}, 600000);

// Limpar arquivos temporários ao encerrar
process.on('SIGINT', () => {
  console.log('\n🛑 Encerrando servidor...');
  
  try {
    const files = fs.readdirSync(TEMP_DIR);
    files.forEach(file => {
      const filePath = path.join(TEMP_DIR, file);
      fs.unlinkSync(filePath);
    });
    console.log('🗑️ Arquivos temporários limpos');
  } catch (error) {
    console.error('Erro ao limpar arquivos:', error);
  }
  
  process.exit(0);
});

// Rota principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontd/index.html'));
});

// Iniciar servidor
app.listen(PORT, async () => {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   🎵 LP Music Server                  ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`\n🌐 Servidor: http://localhost:${PORT}`);
  console.log(`📁 Pasta temp: ${TEMP_DIR}`);
  
  await checkYtDlp();
  
  console.log(`\n📊 Status:`);
  console.log(`   yt-dlp: ${ytDlpAvailable ? '✅ Disponível' : '❌ Não instalado'}`);
  
  if (!ytDlpAvailable) {
    console.log('\n⚠️  ATENÇÃO: yt-dlp não está instalado!');
    console.log('📥 Para instalar:');
    console.log('   • Windows: https://github.com/yt-dlp/yt-dlp/releases');
    console.log('   • Linux/Mac: pip install yt-dlp');
  }
  
  console.log('\n✅ Servidor pronto!\n');
});