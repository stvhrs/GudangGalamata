import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Modal, Form, Input, InputNumber, Button, message, Spin, Typography, Select, Space, Card, Row, Col, Statistic, DatePicker
} from 'antd';
import { ref, push, serverTimestamp, runTransaction, set } from 'firebase/database';
import { db } from '../../../api/firebase';
import { numberFormatter } from '../../../utils/formatters';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { Text } = Typography;

// --- Komponen Subtotal Display ---
const SubtotalDisplay = ({ index }) => (
  <Form.Item
    noStyle
    shouldUpdate={(prev, cur) => prev.items?.[index]?.quantity !== cur.items?.[index]?.quantity}
  >
    {({ getFieldValue }) => {
      const quantity = Number(getFieldValue(['items', index, 'quantity']) || 0);
      const color = quantity > 0 ? '#52c41a' : quantity < 0 ? '#f5222d' : '#8c8c8c';
      const prefix = quantity > 0 ? '+' : '';
      return (
        <Input
          readOnly
          disabled
          value={`${prefix}${numberFormatter(quantity)}`}
          style={{
            width: '100%',
            textAlign: 'right',
            background: '#f0f2f5',
            color,
            fontWeight: 'bold',
            fontSize: '12px'
          }}
        />
      );
    }}
  </Form.Item>
);

const BulkRestockModal = ({ open, onClose, bukuList }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [selectedBookIdsInForm, setSelectedBookIdsInForm] = useState(new Set());

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({ 
        tanggal: dayjs(),
        items: [{}] 
      });
      setSelectedBookIdsInForm(new Set());
    }
  }, [open, form]);

  const handleFormValuesChange = useCallback((_, allValues) => {
    const currentIds = new Set(allValues.items?.map(item => item?.bookId).filter(Boolean) || []);
    setSelectedBookIdsInForm(currentIds);
  }, []);

  const bookOptions = useMemo(() => {
    return bukuList?.map(buku => {
      const judulBuku = buku.nama || buku.judul || 'Tanpa Judul';
      const kodeBuku = buku.kode_buku || buku.id || 'No ID';
      const penerbit = buku.penerbit || '';

      return {
        label: `[${kodeBuku}] ${judulBuku} (Stok: ${buku.stok})`,
        value: buku.id,
        searchStr: `${kodeBuku} ${judulBuku} ${penerbit}`.toLowerCase(),
        disabled: selectedBookIdsInForm.has(buku.id)
      };
    }) || [];
  }, [bukuList, selectedBookIdsInForm]);

  const generateBulkRefId = () => {
    return `BLK-${dayjs().format('YYYYMMDD-HHmmss')}`;
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      const overallRemark = values.overallRemark || '';
      
      const tanggalObj = values.tanggal || dayjs();
      const tanggalTimestamp = tanggalObj.valueOf(); 

      const items = values.items || [];
      const validItems = items.filter(
        item => item && item.bookId && item.quantity !== null && item.quantity !== undefined
      );

      if (validItems.length === 0) {
        message.warning('Tambahkan setidaknya satu item buku yang valid.');
        return;
      }
      
      const hasZeroQuantity = validItems.some(item => Number(item.quantity) === 0);
      if (hasZeroQuantity) {
        message.error('Jumlah perubahan tidak boleh 0.');
        return;
      }

      setLoading(true);

      const bulkRefId = generateBulkRefId();

      const updatePromises = validItems.map(async (item) => {
        const bookId = item.bookId;
        const jumlahNum = Number(item.quantity);
        const specificRemark = item.specificRemark || '';
        const bukuRef = ref(db, `products/${bookId}`);

        // --- LOGIC PERUBAHAN DI SINI ---
        // 1. Gabungkan input user (Umum + Khusus)
        let userRemark = '';
        if (specificRemark) {
            userRemark = overallRemark ? `${overallRemark} (${specificRemark})` : specificRemark;
        } else {
            userRemark = overallRemark;
        }

        // 2. Tambahkan prefix "Restock"
        let keteranganFinal = '';
        if (userRemark) {
            keteranganFinal = `Restock ${userRemark}`;
        } else {
            // Default jika user tidak isi keterangan apapun
            keteranganFinal = `Restock Ref: ${bulkRefId}`;
        }
        // -------------------------------

        let historyDataForRoot = null;

        await runTransaction(bukuRef, currentData => {
          if (!currentData) return;

          const stokAwal = Number(currentData.stok) || 0;
          const stokAkhir = stokAwal + jumlahNum;

          const judulReal = currentData.nama || currentData.judul || "Tanpa Judul";
          
          historyDataForRoot = {
            bukuId: bookId,
            nama: "ADMIN", 
            refId: bulkRefId,
            
            judul: judulReal,
            perubahan: jumlahNum,
            
            stokAwal: stokAwal,   
            stokAkhir: stokAkhir,
            
            keterangan: keteranganFinal, // <-- Hasil yang sudah ada "Restock"
            
            tanggal: tanggalTimestamp,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          };

          return {
            ...currentData,
            stok: stokAkhir,
            updatedAt: serverTimestamp()
          };
        });

        if (historyDataForRoot) {
          const newHistoryRef = push(ref(db, 'stock_history'));
          await set(newHistoryRef, historyDataForRoot);
        }
      });

      await Promise.all(updatePromises);
      message.success(`Restock berhasil! Ref ID: ${bulkRefId}`);
      onClose();
    } catch (error) {
      console.error('Error:', error);
      message.error('Gagal menyimpan data.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
style={{ top: 20 }}
      title="Restock Buku Borongan"
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnClose
      width={1400} 
      style={{ top: 20 }}
    >
      <Spin spinning={loading} tip="Menyimpan Data...">
        <Form
          form={form}
          layout="vertical"
          autoComplete="off"
          onValuesChange={handleFormValuesChange}
        >
          {/* --- HEADER FORM --- */}
          <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
            <Row gutter={16}>
              <Col xs={24} md={6}>
                <Form.Item 
                  name="tanggal" 
                  label="Tanggal Transaksi" 
                  rules={[{ required: true, message: 'Pilih tanggal' }]}
                  style={{ marginBottom: 0 }}
                >
                  <DatePicker 
                    style={{ width: '100%' }} 
                    format="DD MMM YYYY" 
                    allowClear={false}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={18}>
                <Form.Item 
                  name="overallRemark" 
                  label="Keterangan Umum"
                  style={{ marginBottom: 0 }}
                >
                  <Input placeholder="Contoh: Stok Opname Gudang A..." />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          {/* --- LIST ITEM --- */}
          <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 4 }}>
            <Form.List name="items">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name, ...restField }, index) => (
                    <Card
                      key={key}
                      size="small"
                      style={{
                        marginBottom: 8,
                        backgroundColor: index % 2 === 0 ? '#ffffff' : '#f9f9f9',
                        borderColor: '#e8e8e8'
                      }}
                      bodyStyle={{ padding: '8px 12px' }}
                    >
                      <Row gutter={[8, 0]} align="middle">
                        
                        {/* 1. CARI BUKU */}
                        <Col xs={24} md={7}>
                          <Form.Item
                            {...restField}
                            name={[name, 'bookId']}
                            style={{ marginBottom: 0 }}
                            rules={[{ required: true, message: '' }]}
                          >
                            <Select
                              showSearch
                              placeholder="Pilih Buku..."
                              style={{ width: '100%' }}
                              options={bookOptions}
                              optionFilterProp="label"
                              filterOption={(input, option) => 
                                (option?.searchStr || '').includes(input.toLowerCase())
                              }
                            />
                          </Form.Item>
                        </Col>

                        {/* 2. QTY */}
                        <Col xs={12} md={3}>
                          <Form.Item
                            {...restField}
                            name={[name, 'quantity']}
                            style={{ marginBottom: 0 }}
                            rules={[{ required: true, message: '' }]}
                          >
                            <InputNumber 
                              placeholder="Qty" 
                              style={{ width: '100%' }} 
                            />
                          </Form.Item>
                        </Col>

                        {/* 3. HASIL */}
                        <Col xs={12} md={3}>
                           <SubtotalDisplay index={index} />
                        </Col>

                        {/* 4. KETERANGAN SPESIFIK */}
                        <Col xs={22} md={10}>
                          <Form.Item
                            {...restField}
                            name={[name, 'specificRemark']}
                            style={{ marginBottom: 0 }}
                          >
                            <Input placeholder="Ket. khusus item ini..." />
                          </Form.Item>
                        </Col>

                        {/* 5. TOMBOL HAPUS */}
                        <Col xs={2} md={1} style={{ textAlign: 'center' }}>
                          <Button
                            type="text"
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                            onClick={() => remove(name)}
                          />
                        </Col>
                      </Row>
                    </Card>
                  ))}

                  <Button
                    type="dashed"
                    onClick={() => add()}
                    block
                    icon={<PlusOutlined />}
                    style={{ marginTop: 8 }}
                  >
                    Tambah Baris
                  </Button>
                </>
              )}
            </Form.List>
          </div>

          {/* --- FOOTER TOTAL --- */}
          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) =>
              JSON.stringify(prev.items || []) !== JSON.stringify(cur.items || [])
            }
          >
            {({ getFieldValue }) => {
              const items = getFieldValue('items') || [];
              const totalQty = items.reduce((acc, curr) => acc + (Number(curr?.quantity) || 0), 0);
              
              return (
                <div style={{ marginTop: 16, padding: '12px', background: '#f0f2f5', borderRadius: 4 }}>
                  <Row justify="space-between" align="middle">
                    <Col>
                      <Text type="secondary">
                         *Nama Admin: <b>ADMIN</b>
                      </Text>
                    </Col>
                    <Col>
                      <Space size="large">
                        <Statistic 
                          title="Total Perubahan" 
                          value={totalQty} 
                          valueStyle={{ fontSize: 18, color: totalQty >= 0 ? '#3f8600' : '#cf1322' }} 
                          prefix={totalQty > 0 ? '+' : ''}
                        />
                        <Button onClick={onClose} disabled={loading}>Batal</Button>
                        <Button type="primary" onClick={handleOk} loading={loading}>
                          Simpan Semua
                        </Button>
                      </Space>
                    </Col>
                  </Row>
                </div>
              );
            }}
          </Form.Item>
        </Form>
      </Spin>
    </Modal>
  );
};

export default BulkRestockModal;