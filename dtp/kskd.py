import tensorflow as tf
from tensorflow.keras.preprocessing.image import ImageDataGenerator
from tensorflow.keras.applications import EfficientNetB2
from tensorflow.keras.layers import Dense, GlobalAveragePooling2D, Dropout, BatchNormalization
from tensorflow.keras.models import Model
from tensorflow.keras.callbacks import EarlyStopping, ModelCheckpoint, ReduceLROnPlateau
from PIL import ImageFile
import numpy as np

ImageFile.LOAD_TRUNCATED_IMAGES = True

# --- CONFIG ---
dataset_path = 'Dataset'
IMG_SIZE = (288, 288)
BATCH_SIZE = 32

# 🚀 Mixed Precision (jika GPU)
tf.keras.mixed_precision.set_global_policy('mixed_float16')

# --- AUGMENTATION ---
datagen = ImageDataGenerator(
    rescale=1./255,
    rotation_range=25,
    width_shift_range=0.15,
    height_shift_range=0.15,
    zoom_range=0.2,
    brightness_range=[0.8, 1.2],
    horizontal_flip=True,
    validation_split=0.2
)

train_gen = datagen.flow_from_directory(
    dataset_path,
    target_size=IMG_SIZE,
    batch_size=BATCH_SIZE,
    class_mode='categorical',
    subset='training'
)

val_gen = datagen.flow_from_directory(
    dataset_path,
    target_size=IMG_SIZE,
    batch_size=BATCH_SIZE,
    class_mode='categorical',
    subset='validation'
)

# --- MODEL ---
base_model = EfficientNetB2(weights='imagenet', include_top=False, input_shape=(288,288,3))
base_model.trainable = False

x = base_model.output
x = GlobalAveragePooling2D()(x)
x = Dense(256, activation='relu')(x)
x = BatchNormalization()(x)
x = Dropout(0.5)(x)

outputs = Dense(len(train_gen.class_indices), activation='softmax', dtype='float32')(x)

model = Model(inputs=base_model.input, outputs=outputs)

# --- CALLBACKS ---
callbacks = [
    EarlyStopping(patience=4, restore_best_weights=True),
    ModelCheckpoint("best_model.h5", save_best_only=True),
    ReduceLROnPlateau(factor=0.3, patience=2)
]

# --- TRAINING STEP 1 ---
model.compile(
    optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3),
    loss='categorical_crossentropy',
    metrics=['accuracy']
)

model.fit(train_gen, validation_data=val_gen, epochs=10, callbacks=callbacks)

# --- TRAINING STEP 2 (Fine-tuning sebagian layer) ---
for layer in base_model.layers[-60:]:
    if not isinstance(layer, BatchNormalization):
        layer.trainable = True

# Use a very small learning rate for fine-tuning
model.compile(
    optimizer=tf.keras.optimizers.Adam(learning_rate=1e-5), # Reduced from 1e-4
    loss='categorical_crossentropy',
    metrics=['accuracy']
)

model.fit(train_gen, validation_data=val_gen, epochs=20, callbacks=callbacks)

model.save('face_shape_model.h5')
print("✅ Model terbaik disimpan!")