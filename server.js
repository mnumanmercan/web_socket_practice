// Express ve HTTP modüllerini içe aktarıyoruz
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');

// Express uygulamasını oluşturuyoruz
const app = express();

// HTTP sunucusunu Express ile birlikte başlatıyoruz
const server = http.createServer(app);

// Socket.IO'yu HTTP sunucusuyla entegre ediyoruz
const io = socketIO(server);

// PORT numarasını belirliyoruz
const PORT = 3000;

// Static dosyaları (HTML, CSS, JS) 'public' klasöründen sunuyoruz
app.use(express.static('public'));

// Bağlı kullanıcıları takip etmek için bir Map kullanıyoruz
// Key: socket.id, Value: kullanıcı adı
const users = new Map();

// Socket.IO bağlantı eventi - Her yeni kullanıcı bağlandığında çalışır
io.on('connection', (socket) => {
  console.log('Yeni bir kullanıcı bağlandı:', socket.id);

  // Kullanıcı adı alma eventi - Kullanıcı kendini tanıttığında
  socket.on('set-username', (username) => {
    // Kullanıcıyı Map'e ekliyoruz
    users.set(socket.id, username);
    console.log(`${username} chat'e katıldı`);

    // Diğer BÜTÜN kullanıcılara bildirim gönderiyoruz
    // socket.broadcast.emit sadece gönderene değil, diğerlerine gönderir
    socket.broadcast.emit('user-connected', {
      username: username,
      message: `${username} sohbete katıldı`
    });

    // Gönderen kullanıcıya başarılı mesajı
    socket.emit('username-set', {
      success: true,
      message: 'Kullanıcı adı başarıyla ayarlandı'
    });
  });

  // Mesaj gönderme eventi - Kullanıcı mesaj gönderdiğinde
  socket.on('send-message', (data) => {
    // Gönderenin kullanıcı adını alıyoruz
    const senderUsername = users.get(socket.id);

    // Mesaj objesini oluşturuyoruz
    const message = {
      username: senderUsername,
      text: data.text,
      timestamp: new Date().toLocaleTimeString('tr-TR')
    };

    console.log(`${senderUsername} mesaj gönderdi:`, data.text);

    // Mesajı GÖNDEREn dahil HERKESE gönderiyoruz
    // io.emit = bütün bağlı clientlara gönderir
    io.emit('receive-message', message);
  });

  // Kullanıcı yazıyor bildirimi
  socket.on('typing', () => {
    const username = users.get(socket.id);
    // Sadece diğer kullanıcılara gönder (kendine gönderme)
    socket.broadcast.emit('user-typing', { username });
  });

  // Kullanıcı yazmayı bıraktı bildirimi
  socket.on('stop-typing', () => {
    const username = users.get(socket.id);
    socket.broadcast.emit('user-stop-typing', { username });
  });

  // Bağlantı kopma eventi - Kullanıcı ayrıldığında
  socket.on('disconnect', () => {
    const username = users.get(socket.id);
    
    if (username) {
      console.log(`${username} ayrıldı`);
      
      // Kullanıcıyı Map'ten çıkarıyoruz
      users.delete(socket.id);

      // Diğer kullanıcılara bildirim gönderiyoruz
      socket.broadcast.emit('user-disconnected', {
        username: username,
        message: `${username} sohbetten ayrıldı`
      });
    }
  });
});

// Sunucuyu başlatıyoruz
server.listen(PORT, () => {
  console.log(`🚀 Sunucu http://localhost:${PORT} adresinde çalışıyor`);
  console.log(`📝 Tarayıcıda iki sekme açıp chat'i test edebilirsin!`);
});
